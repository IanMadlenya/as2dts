import Token = require('./token');
import NodeKind = require('./nodeKind');
import Operators = require('./operators');
import KeyWords = require('./keywords');
import Node = require('./node');

//Utils
function assign(target: any, ...items: any[]): any {
    return items.reduce(function (target: any, source: any) {
        return Object.keys(source).reduce((target: any, key: string) => {
            target[key] = source[key];
            return target;
        }, target);
    }, target);
}


var keywordsCheck: { [index: string]: boolean } 
    = Object.keys(KeyWords).reduce(
        (result: { [index: string]: boolean}, key: string) => {
            var keyword: string = (<any>KeyWords)[key];
            result[keyword] = true;
            return result;
        }, <{ [index: string]: boolean}>{}
    );

function isKeyWord(text: string): boolean {
    return !!keywordsCheck[text];
}





function transformAST(node:Node, parentNode: Node): Node {
    //we don't care about comment
    var newNode=  new Node(
		node.content(),
        node.kind, 
        node.start,
        node.end,
        node.text,
        [],
        parentNode
    );
    
    newNode.children = node.children.filter(
        child => !!child && 
            child.kind !== NodeKind.AS_DOC && 
            child.kind !== NodeKind.MULTI_LINE_COMMENT
    ).map(child => transformAST(child, newNode))
    
    return newNode;
}


interface Scope {
    parent: Scope;
    declarations: Declaration[];
    isTopLevel: boolean;
}
var globVars = [
    'undefined', 'NaN', 'Infinity',
    'Array',  'Boolean',  'decodeURI',  'decodeURIComponent',  'encodeURI',  'encodeURIComponent',  'escape',  
    'int',  'isFinite',  'isNaN',  'isXMLName',  'Number',  'Object',  
    'parseFloat', 'parseInt',  'String',  'trace',  'uint',  'unescape',  'Vector',  'XML',  'XMLList',
    'ArgumentError',  'arguments',  'Class',  'Date',  'DefinitionError',  'Error',  'EvalError',  'Function',  'Math',  'Namespace',                       'QName',  'RangeError',  'ReferenceError',  'RegExp',  'SecurityError',  'SyntaxError',  'TypeError',  'URIError',  'VerifyError'
];


interface Declaration { 
    bound?: string; 
    name: string; 
}

export interface EmitterOptions { 
	defsOnly?: boolean;
}

var defaultEmitterOptions = {
	defsOnly: false
}

var data: {
    source: string;
    options: EmitterOptions;
}

var state: {
    index: number;
    currentClassName: string;
	inConstructor: boolean;
    scope: Scope;
    isNew: boolean;
    emitThisForNextIdent: boolean;
    parentNode?: Node
};

var output: string;
export function emit(ast: Node, source: string, options?: EmitterOptions) {
    data = {
        source: source,
        options: assign(defaultEmitterOptions, options || {})
    };
    Object.freeze(data);
    
    
    state = {
        index: 0,
        currentClassName: '',
		inConstructor: false,
        scope: null,
        isNew: false,
        emitThisForNextIdent: true
    }
    output = '';
    
    enterScope([]);
    visitNode(transformAST(ast, null));
    catchup(data.source.length -1);
    exitScope();
    return output;
}

function visitNodes(nodes: Node[]) {
    if (!nodes) {
        return;
    }
    nodes.forEach(node =>  visitNode(node));
}

var visitors: {[kind: string]: (node: Node) => void } = {};

visitors[NodeKind.PACKAGE] = emitPackage;
visitors[NodeKind.META] = emitMeta;
visitors[NodeKind.IMPORT] = emitImport;
visitors[NodeKind.INCLUDE] = visitors[NodeKind.USE] = emitInclude;
visitors[NodeKind.FUNCTION] = emitFunction;
visitors[NodeKind.LAMBDA] = emitFunction;
visitors[NodeKind.INTERFACE] = emitInterface;
visitors[NodeKind.CLASS] = emitClass;
visitors[NodeKind.VECTOR] = emitVector;
visitors[NodeKind.SHORT_VECTOR] = emitShortVector;
visitors[NodeKind.TYPE] = emitNodeText;
visitors[NodeKind.NAME] = emitNodeText;
visitors[NodeKind.EXTENDS] = emitNodeText;
visitors[NodeKind.IMPLEMENTS] = emitNodeText;
visitors[NodeKind.CALL] = emitCall;
visitors[NodeKind.NEW] = emitNew;
visitors[NodeKind.RELATION] = emitRelation;
visitors[NodeKind.OP] = emitOp;
visitors[NodeKind.IDENTIFIER] = emitIdent;
visitors[NodeKind.XML_LITERAL] = emitXMLLiteral;
visitors[NodeKind.CONST_LIST] = emitConstList;
visitors[NodeKind.REST] = emitRest;

function visitNode(node: Node)
{
	if (!node)
	    return;
	
	var defsOnly = data.options.defsOnly;
	if (defsOnly && node.kind === NodeKind.CONTENT && node.parent.kind !== NodeKind.PACKAGE)
	{
		// skip anything outside a package block
		catchup(node.start);
		skipTo(node.subtreeEnd);
	}
	else if (defsOnly && node.kind === NodeKind.NAME && node.findParent(NodeKind.PARAMETER) && (node.parent.findChild(NodeKind.INIT) || state.inConstructor))
	{
		// denote optional parameters
		emitNodeText(node);
		insert('?');
	}
	else if (defsOnly && node.kind === NodeKind.INIT && node.parent.kind === NodeKind.NAME_TYPE_INIT)
	{
		// skip default values
		skipTo(node.subtreeEnd);
	}
	else if (defsOnly && node.kind === NodeKind.BLOCK
			 && (node.parent.kind === NodeKind.FUNCTION || node.parent.kind === NodeKind.GET || node.parent.kind === NodeKind.SET))
	{
		// skip children of function block
        skipTo(node.subtreeEnd);
		if (state.inConstructor)
		{
			if (node.findParent(NodeKind.CLASS).findChild(NodeKind.EXTENDS))
				insert(' { super(); }');
			else
				insert(' { }');
		}
		else if (node.parent.kind === NodeKind.SET)
		{
			insert(' { }');
		}
		else
		{
	        insert(' { return null as any; }');
		}
	}
	else if (visitors.hasOwnProperty(node.kind))
	{
	    visitors[node.kind](node);
	}
	else
	{
	    catchup(node.start);
    	visitNodes(node.children);
	}
}

var GLOBAL_MODULE:string = '__global__';
var globalExports:string[] = [];

function emitRest(node:Node) {
	// emit "...rest"
	catchup(node.end);
	
	insert(':');
	
	// emit type
	visitNodes(node.children);
}

function emitPackage(node: Node) {
    catchup(node.start);
    skip(NodeKind.PACKAGE.length);
	
    insert('module');
	if (!node.findChild(NodeKind.NAME).text)
		insert(' ' + GLOBAL_MODULE);
    visitNodes(node.children);
	
	catchup(node.subtreeEnd);
	
	var name:string;
	while (name = globalExports.shift())
		insert('\nimport ' + name + ' = ' + GLOBAL_MODULE + '.' + name + ';');
}

function emitMeta(node: Node) {
    catchup(node.start);
    commentNode(node, false);
}

function emitInclude(node: Node) {
    catchup(node.start);
    commentNode(node, true);
}

function emitImport(node: Node) {
    catchup(node.start + NodeKind.IMPORT.length + 1);
    var split = node.text.split('.');
    var name = split[split.length -1];
    insert(name + ' = ');
    catchup(node.end);
    state.scope.declarations.push({ name: name });
}

function emitInterface(node: Node) {
    var exported = emitDeclaration(node);

    //we'll catchup the other part
	var name:string = node.findChild(NodeKind.NAME).text;
    state.scope.declarations.push({ name: name });
    var content = node.findChild(NodeKind.CONTENT)
    var contentsNode = content && content.children;
    var foundVariables: { [name: string]: boolean } = {};
    if (contentsNode) {
        contentsNode.forEach(node => {
            visitNode(node.findChild(NodeKind.META_LIST));
            catchup(node.start);
            if (node.kind === NodeKind.FUNCTION) {
                skip(8);
				visitNodes(node.children);
            } else if (node.kind === NodeKind.GET || node.kind === NodeKind.SET) {
                var name = node.findChild(NodeKind.NAME),
                    paramerterList = node.findChild(NodeKind.PARAMETER_LIST); 
                if (!foundVariables[name.text]) {
                    skipTo(name.start);
                    catchup(name.end);
                    foundVariables[name.text] = true;
                    if (node.kind === NodeKind.GET) {
                        skipTo(paramerterList.end);
                        var type = node.findChild(NodeKind.TYPE);
                        if (type) {
                            emitNodeText(type);
                        }
                    } else if (node.kind === NodeKind.SET) {
                        var setParam = paramerterList
                            .findChild(NodeKind.PARAMETER).children[0];
                        skipTo(setParam.findChild(NodeKind.NAME).end)
                        var type = setParam.findChild(NodeKind.TYPE);
                        if (type) {
                            emitNodeText(type);
                        }
                        skipTo(node.end);
                    }
                } else {
                    commentNode(node, true);
                }
            } else {
                //include or import in interface content not supported
                commentNode(node, true);
            }
        })
    }
	catchup(node.subtreeEnd);
	if (exported)
		insert('\nexport var ' + name + ':new(..._:any[])=>' + name + ';');
}

function emitFunction(node: Node) {
    emitDeclaration(node);
    enterFunctionScope(node);
    var rest = node.getChildrenStartingFrom(NodeKind.MOD_LIST);
    exitScope();
    visitNodes(rest);
}

function emitClass(node: Node) {
    emitDeclaration(node);
    var name = node.findChild(NodeKind.NAME);
    state.currentClassName = name.text.split('<')[0];
	visitNode(name);
    var content = node.findChild(NodeKind.CONTENT)
    var contentsNode = content && content.children;
    if (contentsNode) {
        //collects declarations
        enterClassScope(contentsNode);
        contentsNode.forEach(node => {
            visitNode(node.findChild(NodeKind.META_LIST));
            catchup(node.start);
            switch (node.kind) {
                case NodeKind.SET:
                    emitSet(node);
                    break;
                case NodeKind.GET:
                case NodeKind.FUNCTION:
                    emitMethod(node);
                    break;
                case NodeKind.VAR_LIST:
                    emitPropertyDecl(node);
                    break;
                case NodeKind.CONST_LIST:
                    emitPropertyDecl(node, true);
                    break;
                default:
                    visitNode(node);
            }
        });
        exitScope();
    }
    state.currentClassName = null;
}


function emitSet(node: Node) {
    if (!emitClassField(node))
	{
		skipTo(node.subtreeEnd);
		return;
	}
    var name = node.findChild(NodeKind.NAME);
    consume('function', name.start);
    var params = node.findChild(NodeKind.PARAMETER_LIST)
    visitNode(params);
    catchup(params.end)
    var type = node.findChild(NodeKind.TYPE);
    if (type) {
        skipTo(type.end);
    }
    enterFunctionScope(node);
    visitNodes(node.getChildrenStartingFrom(NodeKind.TYPE));
    exitScope();
}

function emitConstList(node: Node) {
    catchup(node.start);
    var nameTypeInit = node.findChild(NodeKind.NAME_TYPE_INIT);
    skipTo(nameTypeInit.start);
    insert('var ');
    visitNode(nameTypeInit);
}

function emitMethod(node: Node) {
    var name:Node = node.findChild(NodeKind.NAME);
	state.inConstructor = node.kind === NodeKind.FUNCTION && name.text === state.currentClassName;
	if (state.inConstructor)
	{
        var mods = node.findChild(NodeKind.MOD_LIST);
        if (mods) {
            catchup(mods.start);
        }
        insert('constructor');
        skipTo(name.end)
	}
	else if (emitClassField(node))
	{
        consume('function', name.start);
		emitNodeText(name);
    }
	else
	{
		skipTo(node.subtreeEnd);
		return;
	}
    enterFunctionScope(node);
    visitNodes(node.getChildrenStartingFrom(NodeKind.NAME));
    exitScope();
	state.inConstructor = false;
}

function emitPropertyDecl(node: Node, isConst = false) {
	var names = node.findChildren(NodeKind.NAME_TYPE_INIT);
	if (!emitClassField(node))
	{
		skipTo(node.subtreeEnd);
		return;
	}
	for (var i:number = 0; i < names.length; i++)
	{
		var name:Node = names[i];
		if (i == 0)
		{
			consume(isConst ? 'const' : 'var', name.start);
			visitNode(name);
		}
		else
		{
			insert('; ');
			emitClassField(node, true);
			skipTo(name.start);
			visitNode(name);
		}
	}
}

function emitClassField(node:Node, again:boolean = false):boolean {
    var mods = node.findChild(NodeKind.MOD_LIST);
    if (mods) {
        catchup(mods.start);
		if (data.options.defsOnly
			&& (mods.findChild(NodeKind.MODIFIER, 'private')
				|| mods.findChild(NodeKind.MODIFIER, 'protected')
				|| mods.findChild(NodeKind.MODIFIER, 'internal')))
		{
			return false;
		}
        mods.children.forEach(node => {
            catchup(node.start);
            if (node.text === 'private' || node.text === 'public' || node.text === 'protected' || node.text === 'static')
			{
				if (again)
					insert(node.text + ' ');
			}
			else
			{
                commentNode(node, false);
			}
            catchup(node.end);
        });
    }
	return true;
}

function emitDeclaration(node: Node):boolean {
    catchup(node.start);
    visitNode(node.findChild(NodeKind.META_LIST));
    var mods = node.findChild(NodeKind.MOD_LIST);
    if (mods && mods.children.length) {
        catchup(mods.start);
        var insertExport = false;
        mods.children.forEach(node => {
            if (node.text !== 'private') {
                insertExport = true;
            }  
            skipTo(node.end);
        });
		if (insertExport)
		{
            insert('export');

			var pkg = node.findParent(NodeKind.PACKAGE);
			if (pkg && !pkg.findChild(NodeKind.NAME).text)
				globalExports.push(node.findChild(NodeKind.NAME).text);
		}
    }
	return insertExport;
}

var typeMapping:{[type:string]:string} = {
	'Array': 'any[]',
	'Boolean': 'boolean',
	'Class': 'new(..._:any[])=>any',
	'int': 'number',
	'Number': 'number',
	'String': 'string',
	'uint': 'number',
	'*': 'any'
};

function emitNodeText(node: Node) {
    catchup(node.start);
    skipTo(node.end);
	insert(' ');
	insert(typeMapping.hasOwnProperty(node.text) ? typeMapping[node.text] : node.text);
	insert(' ');
}

function emitVector(node: Node) {
    catchup(node.start);
    var type = node.findChild(NodeKind.TYPE);
    if (type) {
        skipTo(type.start);
        emitNodeText(type);
        insert('[]');
    } else {
        insert('any[]');
    }
    skipTo(node.end);
}

function emitShortVector(node: Node) {
    catchup(node.start);
    var vector = node.findChild(NodeKind.VECTOR);
    insert('Array');
    var type = vector.findChild(NodeKind.TYPE);
    if(type) {
        emitNodeText(type);
    } else {
        insert('any');
    }
    catchup(vector.end);
    insert('(');
    var arrayLiteral = node.findChild(NodeKind.ARRAY)
    if (arrayLiteral.children && arrayLiteral.children.length) {
        skipTo(arrayLiteral.children[0].start)
        visitNodes(arrayLiteral.children)
        catchup(arrayLiteral.lastChild.end);
    }
    insert(')');
    skipTo(node.end);
}

function emitNew(node:Node) {
    catchup(node.start);
    state.isNew = true;
    state.emitThisForNextIdent = false;
    visitNodes(node.children);
    state.isNew = false;
}

function emitCall(node: Node) {
    catchup(node.start);
    var isNew = state.isNew;
    state.isNew = false;
    if (node.children[0].kind === NodeKind.VECTOR) {
        if (isNew) {
            var vector = node.children[0];
            catchup(vector.start);
            insert('Array');
            insert('<')
            var type = vector.findChild(NodeKind.TYPE);
            if (type) {
                skipTo(type.start);
                emitNodeText(type);
            } else {
                insert('any');
            }
            skipTo(vector.end);
            insert('>');
            visitNodes(node.getChildrenStartingFrom(NodeKind.VECTOR));
            return;
        }

        var args = node.findChild(NodeKind.ARGUMENTS);
        //vector conversion lets just cast to array
        if (args.children.length === 1) {
            insert('(<');
            emitVector(node.children[0]);
            insert('>');
            skipTo(args.children[0].start);
            visitNode(args.children[0]);
            catchup(node.end);
            return;
        }
    } 
    visitNodes(node.children);
}

function emitRelation(node: Node) {
    catchup(node.start);
    var as = node.findChild(NodeKind.AS);
    if (as) {
        if (node.lastChild.kind === NodeKind.IDENTIFIER) {
            insert('<');
            insert(node.lastChild.text);
            insert('>');
            visitNodes(node.getChildrenUntil(NodeKind.AS));
            catchup(as.start);
            skipTo(node.end);
        } else {
            commentNode(node, false);
        }
        return;
    }
    visitNodes(node.children)
}

function emitOp(node: Node) {
    catchup(node.start);
    if (node.text === "is") {
        insert('instanceof');
        skipTo(node.end);
        return;
    }
    catchup(node.end);
}


function emitIdent(node: Node) {
    catchup(node.start);
    if (node.parent && node.parent.kind === NodeKind.DOT) {
        //in case of dot just check the first
        if(node.parent.children[0] !== node) {
            return;
        }
    }
    
    if (isKeyWord(node.text)) {
        return;
    }
    
    var def = findDefInScope(node.text);
    if (def && def.bound) {
        insert(def.bound + '.');
    }
    if (!def && state.currentClassName && globVars.indexOf(node.text) === -1 && state.emitThisForNextIdent && node.text !== state.currentClassName) {
        insert('this.');
    }
    state.emitThisForNextIdent = true;
}

function emitXMLLiteral(node: Node) {
    catchup(node.start);
    insert(JSON.stringify(node.text))
    skipTo(node.end);
}


function enterClassScope(contentsNode: Node[]) {
    var found: {[name: string]: boolean } = {};

    var declarations = contentsNode.map(node => {
        var nameNode: Node;
        var isStatic: boolean;

        switch (node.kind) {
            case NodeKind.SET:
            case NodeKind.GET:
            case NodeKind.FUNCTION:
                nameNode = node.findChild(NodeKind.NAME);
                break;
            case NodeKind.VAR_LIST:
            case NodeKind.CONST_LIST:
                nameNode = node.findChild(NodeKind.NAME_TYPE_INIT).findChild(NodeKind.NAME);
                break;
        }
        if (!nameNode || found[nameNode.text]) {
            return null;
        }
        found[nameNode.text] = true;
        if (nameNode.text === state.currentClassName) {
            return;
        }
        var modList = node.findChild(NodeKind.MOD_LIST);
        var isStatic = modList && 
            modList.children.some(mod => mod.text === 'static');
        return {
            name: nameNode.text,
            bound: isStatic ? state.currentClassName : 'this'
        };
    }).filter(el => !!el);

    enterScope(declarations);
}

function enterFunctionScope(node: Node) {
    var decls: Declaration[]  = [];
    var params = node.findChild(NodeKind.PARAMETER_LIST);
    if (params && params.children.length) {
        decls = params.children.map(param => {
            var nameTypeInit  = param.findChild(NodeKind.NAME_TYPE_INIT);
            if (nameTypeInit) {
                return {name: nameTypeInit.findChild(NodeKind.NAME).text}
            } 
            var rest = param.findChild(NodeKind.REST)
            return { name: rest.text };
        });
    }
    var block = node.findChild(NodeKind.BLOCK);
    if (block) {
        function traverse(node: Node): Declaration[] {
            var result = new Array<Declaration>();
            if (node.kind === NodeKind.VAR_LIST || node.kind === NodeKind.CONST_LIST ||
                node.kind === NodeKind.VAR || node.kind === NodeKind.CONST) {
                result = result.concat(
                    node
                        .findChildren(NodeKind.NAME_TYPE_INIT)
                        .map(node => ({ name: node.findChild(NodeKind.NAME).text }))
                );
            } 
            if (node.kind !== NodeKind.FUNCTION && node.children && node.children.length) {
                result = Array.prototype.concat.apply(result, node.children.map(traverse));
            }
            return result.filter(decl => !!decl);
        }
        decls = decls.concat(traverse(block));
    }
    
    enterScope(decls);
}

function enterScope(decls: Declaration[]) {
    state.scope = {
        parent: state.scope,
        declarations: decls,
        get isTopLevel() {
            return !state.scope;
        }
    };
}

function exitScope() {
    state.scope = state.scope && state.scope.parent;
}

function findDefInScope(text: string) {
    var scope = state.scope;
    while(scope) {
        for (var i = 0; i< scope.declarations.length; i++) {
            if (scope.declarations[i].name === text) {
                return scope.declarations[i];
            }
        }
        scope = scope.parent;
    }
    return null;
}

function commentNode(node: Node, catchSemi:boolean) {
    insert('/*');
    catchup(node.end);
    var index = state.index;
    if (catchSemi) {
        while(true) {
            if (index >= data.source.length) {
                break;
            }
            if (data.source[index] === '\n') {
                catchup(index);
                break;
            }
            if (data.source[index] === ';') {
                catchup(index + 1);
                break;
            }
            index++;
        }
    }
    insert('*/'); 
}

function catchup(index: number) {
    if (state.index > index) {
        return;
    }
    while (state.index !== index) {
        output += data.source[state.index];
        state.index++;
    }
}

function skipTo(index: number) {
	if (index < 0)
		state.index = data.source.length;
	else
	    state.index = index;
}

function skip(number: number) {
    state.index += number;
}

function insert(string: string) {
    output += string;
}

function consume(string: string, limit: number) {
    var index = data.source.indexOf(string, state.index) + string.length;
    if (index > limit || index < state.index) {
		console.log("started searching at: " + data.source.substr(state.index));
		console.log('output:',output);
        throw new Error('invalid consume ' + JSON.stringify({string: string, index: index, limit: limit, "state": state}, null, 3));
    }
    state.index = index;
}
