/**
 *    Copyright (c) 2009, Adobe Systems, Incorporated
 *    All rights reserved.
 *
 *    Redistribution  and  use  in  source  and  binary  forms, with or without
 *    modification,  are  permitted  provided  that  the  following  conditions
 *    are met:
 *
 *      * Redistributions  of  source  code  must  retain  the  above copyright
 *        notice, this list of conditions and the following disclaimer.
 *      * Redistributions  in  binary  form  must reproduce the above copyright
 *        notice,  this  list  of  conditions  and  the following disclaimer in
 *        the    documentation   and/or   other  materials  provided  with  the
 *        distribution.
 *      * Neither the name of the Adobe Systems, Incorporated. nor the names of
 *        its  contributors  may be used to endorse or promote products derived
 *        from this software without specific prior written permission.
 *
 *    THIS  SOFTWARE  IS  PROVIDED  BY THE  COPYRIGHT  HOLDERS AND CONTRIBUTORS
 *    "AS IS"  AND  ANY  EXPRESS  OR  IMPLIED  WARRANTIES,  INCLUDING,  BUT NOT
 *    LIMITED  TO,  THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A
 *    PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER
 *    OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,  INCIDENTAL,  SPECIAL,
 *    EXEMPLARY,  OR  CONSEQUENTIAL  DAMAGES  (INCLUDING,  BUT  NOT  LIMITED TO,
 *    PROCUREMENT  OF  SUBSTITUTE   GOODS  OR   SERVICES;  LOSS  OF  USE,  DATA,
 *    OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 *    LIABILITY,  WHETHER  IN  CONTRACT,  STRICT  LIABILITY, OR TORT (INCLUDING
 *    NEGLIGENCE  OR  OTHERWISE)  ARISING  IN  ANY  WAY  OUT OF THE USE OF THIS
 *    SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
"use strict";
const AS3Scanner = require('./scanner');
const NodeKind = require('./nodeKind');
const Operators = require('./operators');
const KeyWords = require('./keywords');
const Node = require('./node');
var AS2TS_COMMENT = /\/\*\/\s*([^\/\*]*?)\s*\/\*\//;
var ASDOC_COMMENT = "/**";
var MULTIPLE_LINES_COMMENT = "/*";
var NEW_LINE = "\n";
var SINGLE_LINE_COMMENT = "//";
var VECTOR = "Vector";
function isTemplate(str) {
    return str && str.charAt(0) === '<' && str.charAt(str.length - 1) === '>';
}
function startsWith(string, prefix) {
    return string.indexOf(prefix) === 0;
}
;
function endsWith(string, suffix) {
    return string.indexOf(suffix, string.length - suffix.length) !== -1;
}
;
var CARRIAGE_RETURN = 13, LINE_FEED = 10, LINE_SEPARATOR = 0x2028, PARAGRAPH_SEPARATOR = 0x2029, NEXT_LINE = 0x0085;
function isAnyLineBreakCharacter(c) {
    return c === LINE_FEED ||
        c === CARRIAGE_RETURN ||
        c === NEXT_LINE ||
        c === LINE_SEPARATOR ||
        c === PARAGRAPH_SEPARATOR;
}
function getLengthOfLineBreak(text, index) {
    var c = text.charCodeAt(index);
    // common case - ASCII & not a line break
    if (c > CARRIAGE_RETURN && c <= 127) {
        return 0;
    }
    if (c === CARRIAGE_RETURN) {
        var next = index + 1;
        return (next < text.length) && LINE_FEED === text.charCodeAt(next) ? 2 : 1;
    }
    else if (isAnyLineBreakCharacter(c)) {
        return 1;
    }
    else {
        return 0;
    }
}
function buildLineMap(text) {
    var length = text.length;
    // Corner case check
    if (0 === length) {
        var result = new Array();
        result.push(0);
        return result;
    }
    var position = 0;
    var index = 0;
    var arrayBuilder = new Array();
    var lineNumber = 0;
    // The following loop goes through every character in the text. It is highly
    // performance critical, and thus inlines knowledge about common line breaks
    // and non-line breaks.
    while (index < length) {
        var c = text.charCodeAt(index);
        var lineBreakLength;
        // common case - ASCII & not a line break
        if (c > 13 && c <= 127) {
            index++;
            continue;
        }
        else if (c === 13 && index + 1 < length && text.charCodeAt(index + 1) === 10) {
            lineBreakLength = 2;
        }
        else if (c === 10) {
            lineBreakLength = 1;
        }
        else {
            lineBreakLength = getLengthOfLineBreak(text, index);
        }
        if (0 === lineBreakLength) {
            index++;
        }
        else {
            arrayBuilder.push(position);
            index += lineBreakLength;
            position = index;
            lineNumber++;
        }
    }
    // Create a start for the final line.  
    arrayBuilder.push(position);
    return arrayBuilder;
}
function getLineAndCharacterFromPosition(position, lineStarts) {
    if (position < 0 || position > this.length) {
        throw Error("invalid position" + position);
    }
    var lineNumber = -1;
    if (position === this.length) {
        lineNumber = lineStarts.length - 1;
    }
    else {
        for (var i = 0; i < lineStarts.length; i++) {
            if (lineStarts[i] > position) {
                break;
            }
            lineNumber = i;
        }
        lineNumber = lineNumber > 0 ? lineNumber : 0;
    }
    return { line: lineNumber, col: position - lineStarts[lineNumber] };
}
/**
 * @author xagnetti
 */
class AS3Parser {
    /**
     *
     */
    constructor() {
        this.scn = new AS3Scanner();
        this.isInFor = false;
    }
    /*
     * (non-Javadoc)
     * @see com.adobe.ac.pmd.parser.IAS3Parser#buildAst(java.lang.String,
     * java.lang.String[])
     */
    buildAst(filePath, content) {
        this.lineMap = buildLineMap(content);
        return this.parseFile(filePath, content);
    }
    /**
     * @param ignoreDocumentation skip over documentation tokens
     * @param allowNewLine Get the next token Skip comments but keep newlines.
     *                     We need this option for beeing able to decide if a returnStatement has an expression.
     */
    nextToken(ignoreDocumentation = false, allowNewLine = false) {
        do {
            this.tok = this.scn.nextToken();
            if (this.tok == null) {
                throw new Error(this.fileName); //TODO NullTokenException(fileName);
            }
            if (this.tok.text == null) {
                throw new Error(this.fileName); //TODO throw new NullTokenException(fileName);
            }
            var as2ts = AS2TS_COMMENT.exec(this.tok.text);
            if (as2ts) {
                var ts = as2ts[1];
                if (isTemplate(ts))
                    this.tsTemplate = ts;
                else
                    this.tsReplacement = ts;
            }
        } while (as2ts
            || startsWith(this.tok.text, SINGLE_LINE_COMMENT)
            || (!allowNewLine && this.tok.text === NEW_LINE)
            || (ignoreDocumentation && startsWith(this.tok.text, MULTIPLE_LINES_COMMENT)));
    }
    tryParse(func) {
        var tok = this.tok;
        var checkPoint = this.scn.getCheckPoint();
        try {
            return func();
        }
        catch (e) {
            this.scn.rewind(checkPoint);
            return null;
        }
    }
    /**
     * tok is first content token
     *
     * @throws TokenException
     */
    parseClassContent() {
        var result = new Node(this.scn.content, NodeKind.CONTENT, this.tok.index, -1);
        var modifiers = [];
        var meta = [];
        while (!this.tokIs(Operators.RIGHT_CURLY_BRACKET)) {
            if (this.tokIs(Operators.LEFT_CURLY_BRACKET)) {
                result.children.push(this.parseBlock());
            }
            if (this.tokIs(Operators.LEFT_SQUARE_BRACKET)) {
                meta.push(this.parseMetaData());
            }
            else if (this.tokIs(KeyWords.VAR)) {
                this.parseClassField(result, modifiers, meta);
            }
            else if (this.tokIs(KeyWords.CONST)) {
                this.parseClassConstant(result, modifiers, meta);
            }
            else if (this.tokIs(KeyWords.IMPORT)) {
                result.children.push(this.parseImport());
            }
            else if (this.tokIs(KeyWords.INCLUDE) || this.tokIs(KeyWords.INCLUDE_AS2)) {
                result.children.push(this.parseIncludeExpression());
            }
            else if (this.tokIs(KeyWords.FUNCTION)) {
                this.parseClassFunctions(result, modifiers, meta);
            }
            else {
                this.tryToParseCommentNode(result, modifiers);
            }
        }
        if (result.lastChild) {
            result.end = result.lastChild.end;
        }
        return result;
    }
    /**
     * tok is empty, since nextToken has not been called before
     *
     * @throws UnExpectedTokenException
     */
    parseCompilationUnit() {
        var result = new Node(this.scn.content, NodeKind.COMPILATION_UNIT, -1, -1);
        this.nextToken(true);
        if (this.tokIs(KeyWords.PACKAGE)) {
            result.children.push(this.parsePackage());
        }
        else {
            throw new Error('"package" is expected to be the first token in a file');
        }
        result.children.push(this.parsePackageContent());
        return result;
    }
    /**
     * @return
     * @throws TokenException
     */
    parseExpression() {
        return this.parseAssignmentExpression();
    }
    /**
     * tok is first content token
     *
     * @throws TokenException
     */
    parseInterfaceContent() {
        var result = new Node(this.scn.content, NodeKind.CONTENT, this.tok.index, -1);
        while (!this.tokIs(Operators.RIGHT_CURLY_BRACKET)) {
            if (this.tokIs(KeyWords.IMPORT)) {
                result.children.push(this.parseImport());
            }
            else if (this.tokIs(KeyWords.FUNCTION)) {
                result.children.push(this.parseFunctionSignature());
            }
            else if (this.tokIs(KeyWords.INCLUDE) || this.tokIs(KeyWords.INCLUDE_AS2)) {
                result.children.push(this.parseIncludeExpression());
            }
            else if (this.tokIs(Operators.LEFT_SQUARE_BRACKET)) {
                while (!this.tokIs(Operators.RIGHT_SQUARE_BRACKET)) {
                    this.nextToken(true);
                }
                this.nextToken(true);
            }
            else {
                this.tryToParseCommentNode(result, null);
            }
        }
        if (result.lastChild) {
            result.end = result.lastChild.end;
        }
        return result;
    }
    /**
     * tok is first token of content
     *
     * @throws UnExpectedTokenException
     */
    parsePackageContent() {
        var result = new Node(this.scn.content, NodeKind.CONTENT, this.tok.index, -1);
        var modifiers = [];
        var meta = [];
        while (!this.tokIs(Operators.RIGHT_CURLY_BRACKET) && !this.tokIs(KeyWords.EOF)) {
            if (this.tokIs(KeyWords.IMPORT)) {
                result.children.push(this.parseImport());
            }
            else if (this.tokIs(KeyWords.USE)) {
                result.children.push(this.parseUse());
            }
            else if (this.tokIs(KeyWords.INCLUDE) || this.tokIs(KeyWords.INCLUDE_AS2)) {
                result.children.push(this.parseIncludeExpression());
            }
            else if (this.tokIs(Operators.LEFT_SQUARE_BRACKET)) {
                meta.push(this.parseMetaData());
            }
            else if (this.tokIs(KeyWords.CLASS)) {
                result.children.push(this.parseClass(meta, modifiers));
                modifiers.length = 0;
                meta.length = 0;
            }
            else if (this.tokIs(KeyWords.INTERFACE)) {
                result.children.push(this.parseInterface(meta, modifiers));
                modifiers.length = 0;
                meta.length = 0;
            }
            else if (this.tokIs(KeyWords.FUNCTION)) {
                this.parseClassFunctions(result, modifiers, meta);
            }
            else if (startsWith(this.tok.text, ASDOC_COMMENT)) {
                this.currentAsDoc = new Node(this.scn.content, NodeKind.AS_DOC, this.tok.index, this.tok.index + this.tok.index - 1, this.tok.text);
                this.nextToken();
            }
            else if (startsWith(this.tok.text, MULTIPLE_LINES_COMMENT)) {
                this.currentMultiLineComment = new Node(this.scn.content, NodeKind.MULTI_LINE_COMMENT, this.tok.index, this.tok.index + this.tok.index - 1, this.tok.text);
                this.nextToken();
            }
            else {
                modifiers.push(this.tok);
                this.nextToken(true);
            }
        }
        if (result.lastChild) {
            result.end = result.lastChild.end;
        }
        return result;
    }
    /**
     * @return
     * @throws TokenException
     */
    parsePrimaryExpression() {
        var result;
        if (this.tokIs(Operators.LEFT_SQUARE_BRACKET)) {
            return this.parseArrayLiteral();
        }
        else if (this.tokIs(Operators.LEFT_CURLY_BRACKET)) {
            return this.parseObjectLiteral();
        }
        else if (this.tokIs(KeyWords.FUNCTION)) {
            return this.parseLambdaExpression();
        }
        else if (this.tokIs(KeyWords.NEW)) {
            return this.parseNewExpression();
        }
        else if (this.tokIs(Operators.LEFT_PARENTHESIS)) {
            return this.parseEncapsulatedExpression();
        }
        else if (this.tok.text === 'Vector') {
            return this.parseVector();
        }
        else if (this.tokIs(Operators.LESSTHAN)) {
            var res = this.tryParse(() => this.parseShortVector());
            if (res) {
                return res;
            }
        }
        if (this.tok.text === '/' || this.tok.text === '/=') {
            var tok = this.scn.scanRegExp();
            if (tok) {
                this.nextToken(true);
                return new Node(this.scn.content, NodeKind.LITERAL, tok.index, tok.end, tok.text);
            }
        }
        if (this.tok.isXML) {
            result = new Node(this.scn.content, NodeKind.XML_LITERAL, this.tok.index, this.tok.end, this.tok.text);
        }
        else if (this.tok.isNumeric || /('|")/.test(this.tok.text[0])) {
            result = new Node(this.scn.content, NodeKind.LITERAL, this.tok.index, this.tok.end, this.tok.text);
        }
        else {
            result = new Node(this.scn.content, NodeKind.IDENTIFIER, this.tok.index, this.tok.end, this.tok.text);
        }
        this.nextToken(true);
        return result;
    }
    /**
     * tok is the first token of a statement
     *
     * @throws TokenException
     */
    parseStatement() {
        var result;
        if (this.tokIs(KeyWords.FOR)) {
            result = this.parseFor();
        }
        else if (this.tokIs(KeyWords.IF)) {
            result = this.parseIf();
        }
        else if (this.tokIs(KeyWords.SWITCH)) {
            result = this.parseSwitch();
        }
        else if (this.tokIs(KeyWords.DO)) {
            result = this.parseDo();
        }
        else if (this.tokIs(KeyWords.WHILE)) {
            result = this.parseWhile();
        }
        else if (this.tokIs(KeyWords.TRY)) {
            result = this.parseTry();
        }
        else if (this.tokIs(KeyWords.CATCH)) {
            result = this.parseCatch();
        }
        else if (this.tokIs(KeyWords.FINALLY)) {
            result = this.parseFinally();
        }
        else if (this.tokIs(Operators.LEFT_CURLY_BRACKET)) {
            result = this.parseBlock();
        }
        else if (this.tokIs(KeyWords.VAR)) {
            result = this.parseVar();
        }
        else if (this.tokIs(KeyWords.CONST)) {
            result = this.parseConst();
        }
        else if (this.tokIs(KeyWords.RETURN)) {
            result = this.parseReturnStatement();
        }
        else if (this.tokIs(KeyWords.THROW)) {
            result = this.parseThrowStatement();
        }
        else if (this.tokIs(KeyWords.BREAK) || this.tokIs(KeyWords.CONTINUE)) {
            result = this.parseBreakOrContinueStatement();
        }
        else if (this.tokIs(Operators.SEMICOLON)) {
            result = this.parseEmptyStatement();
        }
        else {
            result = this.parseExpressionList();
            this.skip(Operators.SEMICOLON);
        }
        return result;
    }
    /**
     * @return
     * @throws TokenException
     */
    parseUnaryExpression() {
        var result, index = this.tok.index;
        if (this.tokIs(Operators.INCREMENT)) {
            this.nextToken(true);
            result = new Node(this.scn.content, NodeKind.PRE_INC, this.tok.index, index, null, [this.parseUnaryExpression()]);
        }
        else if (this.tokIs(Operators.DECREMENT)) {
            this.nextToken(true);
            result = new Node(this.scn.content, NodeKind.PRE_DEC, this.tok.index, index, null, [this.parseUnaryExpression()]);
        }
        else if (this.tokIs(Operators.MINUS)) {
            this.nextToken(true);
            result = new Node(this.scn.content, NodeKind.MINUS, this.tok.index, index, null, [this.parseUnaryExpression()]);
        }
        else if (this.tokIs(Operators.PLUS) || this.tokIs(Operators.PLUS_AS2)) {
            this.nextToken(true);
            result = new Node(this.scn.content, NodeKind.PLUS, this.tok.index, index, null, [this.parseUnaryExpression()]);
        }
        else {
            return this.parseUnaryExpressionNotPlusMinus();
        }
        return result;
    }
    collectVarListContent(result) {
        result.children.push(this.parseNameTypeInit());
        while (this.tokIs(Operators.COMMA)) {
            this.nextToken(true);
            result.children.push(this.parseNameTypeInit());
        }
        return result;
    }
    /**
     * Compare the current token to the parameter. If it equals, get the next
     * token. If not, throw a runtime exception.
     *
     * @param text
     * @throws UnExpectedTokenException
     */
    consume(text, ignoreDocumentation = false) {
        while (startsWith(this.tok.text, "//")) {
            this.nextToken(ignoreDocumentation);
        }
        if (!this.tokIs(text)) {
            /*throw new UnExpectedTokenException(this.tok.text,
                new Position(this.tok.index, this.tok.getColumn()),
                fileName,
                text);*/
            this.unexpectedToken(text);
        }
        var result = this.tok;
        this.nextToken(ignoreDocumentation);
        return result;
    }
    convertMeta(metadataList) {
        if (metadataList == null || metadataList.length === 0) {
            return null;
        }
        var result = new Node(this.scn.content, NodeKind.META_LIST, this.tok.index, -1);
        result.children = metadataList ? metadataList.slice(0) : [];
        if (result.lastChild) {
            result.end = result.lastChild.end;
        }
        result.start = result.children.reduce((index, child) => {
            return Math.min(index, child ? child.start : Infinity);
        }, result.start);
        return result;
    }
    convertModifiers(modifierList) {
        if (modifierList == null) {
            return null;
        }
        var result = new Node(this.scn.content, NodeKind.MOD_LIST, this.tok.index, -1);
        var end = this.tok.index;
        result.children = modifierList.map(tok => {
            end = tok.index + tok.text.length;
            return new Node(this.scn.content, NodeKind.MODIFIER, tok.index, end, tok.text);
        });
        result.end = end;
        result.start = result.children.reduce((index, child) => {
            return Math.min(index, child ? child.start : Infinity);
        }, result.start);
        return result;
    }
    doParseSignature() {
        var tok = this.consume(KeyWords.FUNCTION);
        var type = new Node(this.scn.content, NodeKind.TYPE, tok.index, tok.end, KeyWords.FUNCTION);
        var checkpoint = this.scn.getCheckPoint();
        if (this.tokIs(KeyWords.SET) || this.tokIs(KeyWords.GET)) {
            var possibleType = new Node(this.scn.content, NodeKind.TYPE, tok.index, this.tok.end, this.tok.text);
            this.nextToken(true); // set or get
            if (this.tokIs(Operators.LEFT_PARENTHESIS))
                this.scn.rewind(checkpoint);
            else
                type = possibleType;
        }
        var name = new Node(this.scn.content, NodeKind.NAME, this.tok.index, this.tok.end, this.tok.text);
        this.nextToken(true); // name
        // append template type if present
        if (this.tsTemplate) {
            name.text += this.tsTemplate;
            name.end = this.tok.index;
        }
        this.tsTemplate = null;
        var params = this.parseParameterList();
        var returnType = this.parseOptionalType();
        return [type, name, params, returnType];
    }
    findFunctionTypeFromSignature(signature) {
        for (var i = 0; i < signature.length; i++) {
            var node = signature[i];
            if (node.kind === NodeKind.TYPE) {
                if (node.text === "set") {
                    return NodeKind.SET;
                }
                if (node.text === "get") {
                    return NodeKind.GET;
                }
                return NodeKind.FUNCTION;
            }
        }
        return NodeKind.FUNCTION;
    }
    /**
     * Get the next token Skip comments but keep newlines We need this method for
     * beeing able to decide if a returnStatement has an expression
     *
     * @throws UnExpectedTokenException
     */
    nextTokenAllowNewLine() {
        do {
            this.tok = this.scn.nextToken();
            if (this.tok == null) {
                throw new Error(this.fileName); //TODO NullTokenException(fileName);
            }
            if (this.tok.text == null) {
                throw new Error(this.fileName); //TODO throw new NullTokenException(fileName);
            }
        } while (startsWith(this.tok.text, SINGLE_LINE_COMMENT));
    }
    parseAdditiveExpression() {
        var result = new Node(this.scn.content, NodeKind.ADD, this.tok.index, this.tok.end, null, [this.parseMultiplicativeExpression()]);
        while (this.tokIs(Operators.PLUS) || this.tokIs(Operators.PLUS_AS2) || this.tokIs(Operators.MINUS)) {
            result.children.push(new Node(this.scn.content, NodeKind.OP, this.tok.index, this.tok.end, this.tok.text));
            this.nextToken(true);
            result.children.push(this.parseMultiplicativeExpression());
        }
        if (result.lastChild) {
            result.end = result.lastChild.end;
        }
        return result.children.length > 1 ? result : result.lastChild;
    }
    // ------------------------------------------------------------------------
    // language specific recursive descent parsing
    // ------------------------------------------------------------------------
    parseAndExpression() {
        var result = new Node(this.scn.content, NodeKind.AND, this.tok.index, this.tok.end, null, [this.parseBitwiseOrExpression()]);
        while (this.tokIs(Operators.AND) || this.tokIs(Operators.AND_AS2)) {
            result.children.push(new Node(this.scn.content, NodeKind.OP, this.tok.index, this.tok.end, this.tok.text));
            this.nextToken(true);
            result.children.push(this.parseBitwiseOrExpression());
        }
        if (result.lastChild) {
            result.end = result.lastChild.end;
        }
        return result.children.length > 1 ? result : result.lastChild;
    }
    /**
     * tok is ( exit tok is first token after )
     */
    parseArgumentList() {
        var tok = this.consume(Operators.LEFT_PARENTHESIS);
        var result = new Node(this.scn.content, NodeKind.ARGUMENTS, tok.index, -1);
        while (!this.tokIs(Operators.RIGHT_PARENTHESIS)) {
            result.children.push(this.parseExpression());
            this.skip(Operators.COMMA, true);
        }
        tok = this.consume(Operators.RIGHT_PARENTHESIS);
        result.end = tok.end;
        return result;
    }
    parseArrayAccessor(node) {
        var result = new Node(this.scn.content, NodeKind.ARRAY_ACCESSOR, node.start, -1);
        result.children.push(node);
        while (this.tokIs(Operators.LEFT_SQUARE_BRACKET)) {
            this.nextToken(true);
            result.children.push(this.parseExpression());
            result.end = this.consume(Operators.RIGHT_SQUARE_BRACKET).end;
        }
        return result;
    }
    /**
     * tok is [
     */
    parseArrayLiteral() {
        var tok = this.consume(Operators.LEFT_SQUARE_BRACKET);
        var result = new Node(this.scn.content, NodeKind.ARRAY, tok.index, -1);
        while (!this.tokIs(Operators.RIGHT_SQUARE_BRACKET)) {
            result.children.push(this.parseExpression());
            this.skip(Operators.COMMA, true);
        }
        result.end = this.consume(Operators.RIGHT_SQUARE_BRACKET, true).end;
        return result;
    }
    parseAssignmentExpression() {
        var result = new Node(this.scn.content, NodeKind.ASSIGN, this.tok.index, this.tok.end, null, [this.parseConditionalExpression()]);
        while (this.tokIs(Operators.EQUAL)
            || this.tokIs(Operators.PLUS_EQUAL) || this.tokIs(Operators.MINUS_EQUAL)
            || this.tokIs(Operators.TIMES_EQUAL) || this.tokIs(Operators.DIVIDED_EQUAL)
            || this.tokIs(Operators.MODULO_EQUAL) || this.tokIs(Operators.AND_EQUAL) || this.tokIs(Operators.OR_EQUAL)
            || this.tokIs(Operators.XOR_EQUAL)) {
            result.children.push(new Node(this.scn.content, NodeKind.OP, this.tok.index, this.tok.end, this.tok.text));
            this.nextToken(true);
            result.children.push(this.parseExpression());
        }
        if (result.lastChild) {
            result.end = result.lastChild.end;
        }
        return result.children.length > 1 ? result : result.lastChild;
    }
    parseBitwiseAndExpression() {
        var result = new Node(this.scn.content, NodeKind.B_AND, this.tok.index, this.tok.end, this.tok.text, [this.parseEqualityExpression()]);
        while (this.tokIs(Operators.B_AND)) {
            result.children.push(new Node(this.scn.content, NodeKind.OP, this.tok.index, this.tok.end, this.tok.text));
            this.nextToken(true);
            result.children.push(this.parseEqualityExpression());
        }
        if (result.lastChild) {
            result.end = result.lastChild.end;
        }
        return result.children.length > 1 ? result : result.lastChild;
    }
    parseBitwiseOrExpression() {
        var result = new Node(this.scn.content, NodeKind.B_OR, this.tok.index, this.tok.end, this.tok.text, [this.parseBitwiseXorExpression()]);
        while (this.tokIs(Operators.B_OR)) {
            result.children.push(new Node(this.scn.content, NodeKind.OP, this.tok.index, this.tok.end, this.tok.text));
            this.nextToken(true);
            result.children.push(this.parseBitwiseXorExpression());
        }
        if (result.lastChild) {
            result.end = result.lastChild.end;
        }
        return result.children.length > 1 ? result : result.lastChild;
    }
    parseBitwiseXorExpression() {
        var result = new Node(this.scn.content, NodeKind.B_XOR, this.tok.index, this.tok.end, this.tok.text, [this.parseBitwiseAndExpression()]);
        while (this.tokIs(Operators.B_XOR)) {
            result.children.push(new Node(this.scn.content, NodeKind.OP, this.tok.index, this.tok.end, this.tok.text));
            this.nextToken(true);
            result.children.push(this.parseBitwiseAndExpression());
        }
        if (result.lastChild) {
            result.end = result.lastChild.end;
        }
        return result.children.length > 1 ? result : result.lastChild;
    }
    parseBlock(result) {
        var tok = this.consume(Operators.LEFT_CURLY_BRACKET);
        if (!result) {
            result = new Node(this.scn.content, NodeKind.BLOCK, tok.index, this.tok.end);
        }
        else {
            result.start = tok.index;
        }
        while (!this.tokIs(Operators.RIGHT_CURLY_BRACKET)) {
            if (startsWith(this.tok.text, MULTIPLE_LINES_COMMENT)) {
                this.currentFunctionNode.children.push(new Node(this.scn.content, NodeKind.MULTI_LINE_COMMENT, this.tok.index, this.tok.end, this.tok.text));
                this.nextToken();
            }
            else {
                result.children.push(this.parseStatement());
            }
        }
        result.end = this.consume(Operators.RIGHT_CURLY_BRACKET).end;
        return result;
    }
    /**
     * tok is catch
     *
     * @throws TokenException
     */
    parseCatch() {
        var tok = this.consume(KeyWords.CATCH);
        this.consume(Operators.LEFT_PARENTHESIS);
        var result = new Node(this.scn.content, NodeKind.CATCH, tok.index, tok.end, null, [
            new Node(this.scn.content, NodeKind.NAME, this.tok.index, this.tok.end, this.tok.text)
        ]);
        this.nextToken(true); // name
        if (this.tokIs(Operators.COLON)) {
            this.nextToken(true); // :
            result.children.push(new Node(this.scn.content, NodeKind.TYPE, this.tok.index, this.tok.end, this.tok.text));
            this.nextToken(true); // type
        }
        this.consume(Operators.RIGHT_PARENTHESIS);
        var parseBlock = this.parseBlock();
        result.children.push(parseBlock);
        result.end = parseBlock.end;
        return result;
    }
    /**
     * tok is class
     *
     * @param meta
     * @param modifier
     * @throws TokenException
     */
    parseClass(meta, modifier) {
        var tok = this.consume(KeyWords.CLASS);
        var result = new Node(this.scn.content, NodeKind.CLASS, tok.index, tok.end);
        if (this.currentAsDoc != null) {
            result.children.push(this.currentAsDoc);
            this.currentAsDoc = null;
        }
        if (this.currentMultiLineComment != null) {
            result.children.push(this.currentMultiLineComment);
            this.currentMultiLineComment = null;
        }
        var index = this.tok.index;
        result.children.push(this.parseQualifiedName(NodeKind.NAME, true));
        result.children.push(this.convertMeta(meta));
        result.children.push(this.convertModifiers(modifier));
        // this.nextToken( true ); // name
        do {
            if (this.tokIs(KeyWords.EXTENDS)) {
                this.nextToken(true); // extends
                result.children.push(this.parseQualifiedName(NodeKind.EXTENDS, false));
            }
            else if (this.tokIs(KeyWords.IMPLEMENTS)) {
                result.children.push(this.parseImplementsList());
            }
        } while (!this.tokIs(Operators.LEFT_CURLY_BRACKET));
        this.consume(Operators.LEFT_CURLY_BRACKET);
        result.children.push(this.parseClassContent());
        var tok = this.consume(Operators.RIGHT_CURLY_BRACKET);
        result.end = tok.end;
        result.start = result.children.reduce((index, child) => {
            return Math.min(index, child ? child.start : Infinity);
        }, index);
        return result;
    }
    parseClassConstant(result, modifiers, meta) {
        result.children.push(this.parseConstList(meta, modifiers));
        if (this.tokIs(Operators.SEMICOLON)) {
            this.nextToken();
        }
        meta.length = 0;
        modifiers.length = 0;
    }
    parseClassField(result, modifiers, meta) {
        var varList = this.parseVarList(meta, modifiers);
        result.children.push(varList);
        if (this.currentAsDoc != null) {
            varList.children.push(this.currentAsDoc);
            this.currentAsDoc = null;
        }
        if (this.currentMultiLineComment != null) {
            result.children.push(this.currentMultiLineComment);
            this.currentMultiLineComment = null;
        }
        if (this.tokIs(Operators.SEMICOLON)) {
            this.nextToken();
        }
        meta.length = 0;
        modifiers.length = 0;
    }
    parseClassFunctions(result, modifiers, meta) {
        result.children.push(this.parseFunction(meta, modifiers));
        meta.length = 0;
        modifiers.length = 0;
    }
    /**
     * tok is (
     *
     * @throws TokenException
     */
    parseCondition() {
        var tok = this.consume(Operators.LEFT_PARENTHESIS);
        var result = new Node(this.scn.content, NodeKind.CONDITION, tok.index, -1, null, [this.parseExpression()]);
        tok = this.consume(Operators.RIGHT_PARENTHESIS);
        result.end = tok.end;
        return result;
    }
    parseConditionalExpression() {
        var result = this.parseOrExpression();
        if (this.tokIs(Operators.QUESTION_MARK)) {
            var conditional = new Node(this.scn.content, NodeKind.CONDITIONAL, result.start, -1, null, [result]);
            this.nextToken(true); // ?
            conditional.children.push(this.parseExpression());
            this.nextToken(true); // :
            conditional.children.push(this.parseExpression());
            conditional.end = conditional.lastChild.start;
            return conditional;
        }
        return result;
    }
    parseConst() {
        var result = this.parseConstList(null, null);
        this.skip(Operators.SEMICOLON);
        return result;
    }
    /**
     * tok is const
     *
     * @param modifiers
     * @param meta
     * @throws TokenException
     */
    parseConstList(meta, modifiers) {
        var tok = this.consume(KeyWords.CONST);
        var result = new Node(this.scn.content, NodeKind.CONST_LIST, tok.index, -1);
        result.children.push(this.convertMeta(meta));
        result.children.push(this.convertModifiers(modifiers));
        this.collectVarListContent(result);
        result.start = result.children.reduce((index, child) => {
            return Math.min(index, child ? child.start : Infinity);
        }, tok.index);
        result.end = result.children.reduce((index, child) => {
            return Math.max(index, child ? child.end : 0);
        }, 0);
        return result;
    }
    parseDecrement(node) {
        this.nextToken(true);
        var result = new Node(this.scn.content, NodeKind.POST_DEC, node.start, this.tok.end);
        result.children.push(node);
        result.end = node.end;
        return result;
    }
    /**
     * tok is do
     *
     * @throws TokenException
     */
    parseDo() {
        var tok = this.consume(KeyWords.DO);
        var result = new Node(this.scn.content, NodeKind.DO, tok.index, -1, null, [this.parseStatement()]);
        this.consume(KeyWords.WHILE);
        var cond = this.parseCondition();
        result.children.push(cond);
        result.end = cond.end;
        if (this.tokIs(Operators.SEMICOLON)) {
            this.nextToken(true);
        }
        return result;
    }
    parseDot(node) {
        this.nextToken(true);
        if (this.tokIs(Operators.LEFT_PARENTHESIS)) {
            var index = this.tok.index;
            this.nextToken(true);
            var result = new Node(this.scn.content, NodeKind.E4X_FILTER, this.tok.index, -1);
            result.children.push(node);
            result.children.push(this.parseExpression());
            result.end = this.consume(Operators.RIGHT_PARENTHESIS).end;
            return result;
        }
        else if (this.tokIs(Operators.TIMES)) {
            var result = new Node(this.scn.content, NodeKind.E4X_STAR, this.tok.index, -1);
            result.children.push(node);
            result.end = node.end;
            return result;
        }
        var result = new Node(this.scn.content, NodeKind.DOT, node.start, -1);
        result.children.push(node);
        result.children.push(new Node(this.scn.content, NodeKind.LITERAL, this.tok.index, this.tok.end, this.tok.text));
        this.nextToken(true);
        result.end = result.children.reduce((index, child) => {
            return Math.max(index, child ? child.end : 0);
        }, 0);
        return result;
    }
    parseEmptyStatement() {
        var result;
        result = new Node(this.scn.content, NodeKind.STMT_EMPTY, this.tok.index, this.tok.end, Operators.SEMICOLON);
        this.nextToken(true);
        return result;
    }
    parseEncapsulatedExpression() {
        var tok = this.consume(Operators.LEFT_PARENTHESIS);
        var result = new Node(this.scn.content, NodeKind.ENCAPSULATED, tok.index, -1);
        result.children.push(this.parseExpressionList());
        tok = this.consume(Operators.RIGHT_PARENTHESIS);
        result.end = tok.end;
        return result;
    }
    parseEqualityExpression() {
        var result = new Node(this.scn.content, NodeKind.EQUALITY, this.tok.index, -1, null, [this.parseRelationalExpression()]);
        while (this.tokIs(Operators.DOUBLE_EQUAL) || this.tokIs(Operators.DOUBLE_EQUAL_AS2) ||
            this.tokIs(Operators.STRICTLY_EQUAL) || this.tokIs(Operators.NOT_EQUAL) ||
            this.tokIs(Operators.NOT_EQUAL_AS2_1) || this.tokIs(Operators.NOT_EQUAL_AS2_2) ||
            this.tokIs(Operators.NOT_STRICTLY_EQUAL)) {
            result.children.push(new Node(this.scn.content, NodeKind.OP, this.tok.index, this.tok.end, this.tok.text));
            this.nextToken(true);
            result.children.push(this.parseRelationalExpression());
        }
        result.end = result.children.reduce((index, child) => {
            return Math.max(index, child ? child.end : 0);
        }, 0);
        return result.children.length > 1 ? result : result.children[0];
    }
    parseExpressionList() {
        var result = new Node(this.scn.content, NodeKind.EXPR_LIST, this.tok.index, -1, null, [this.parseAssignmentExpression()]);
        while (this.tokIs(Operators.COMMA)) {
            this.nextToken(true);
            result.children.push(this.parseAssignmentExpression());
        }
        result.end = result.children.reduce((index, child) => {
            return Math.max(index, child ? child.end : 0);
        }, 0);
        return result.children.length > 1 ? result : result.children[0];
    }
    parseFinally() {
        var result;
        var index = this.tok.index;
        this.nextToken(true);
        var block = this.parseBlock();
        result = new Node(this.scn.content, NodeKind.FINALLY, index, block.end, null, [block]);
        return result;
    }
    /**
     * tok is for
     *
     * @throws TokenException
     */
    parseFor() {
        var tok = this.consume(KeyWords.FOR);
        if (this.tokIs(KeyWords.EACH)) {
            this.nextToken(true);
            return this.parseForEach(tok.index);
        }
        else {
            return this.parseTraditionalFor(tok.index);
        }
    }
    /**
     * tok is ( for each( var obj : Type in List )
     *
     * @throws TokenException
     */
    parseForEach(index) {
        this.consume(Operators.LEFT_PARENTHESIS);
        var result = new Node(this.scn.content, NodeKind.FOREACH, index, -1);
        if (this.tokIs(KeyWords.VAR)) {
            var node = new Node(this.scn.content, NodeKind.VAR, this.tok.index, -1);
            this.nextToken(true);
            var child = this.parseNameTypeInit();
            node.children.push(child);
            node.end = child.end;
            result.children.push(node);
        }
        else {
            result.children.push(new Node(this.scn.content, NodeKind.NAME, this.tok.index, this.tok.end, this.tok.text));
            // names allowed?
            this.nextToken(true);
        }
        var index = this.tok.index;
        this.consume(KeyWords.IN, true);
        var expr = this.parseExpression();
        result.children.push(new Node(this.scn.content, NodeKind.IN, index, expr.end, null, [expr]));
        this.consume(Operators.RIGHT_PARENTHESIS);
        var statement = this.parseStatement();
        result.children.push(statement);
        result.end = statement.end;
        return result;
    }
    parseForIn(result) {
        var index = this.tok.index;
        this.nextToken(true);
        var expr = this.parseExpression();
        result.children.push(new Node(this.scn.content, NodeKind.IN, index, expr.end, null, [expr]));
        result.kind = NodeKind.FORIN;
        this.consume(Operators.RIGHT_PARENTHESIS);
        return result;
    }
    /**
     * tok is function
     *
     * @param modifiers
     * @param meta
     * @throws TokenException
     */
    parseFunction(meta, modifiers) {
        var signature = this.doParseSignature();
        var result = new Node(this.scn.content, this.findFunctionTypeFromSignature(signature), signature[0].start, -1, signature[0].text);
        if (this.currentAsDoc != null) {
            result.children.push(this.currentAsDoc);
            this.currentAsDoc = null;
        }
        if (this.currentMultiLineComment != null) {
            result.children.push(this.currentMultiLineComment);
            this.currentMultiLineComment = null;
        }
        result.children.push(this.convertMeta(meta));
        result.children.push(this.convertModifiers(modifiers));
        result.children.push(signature[1]);
        result.children.push(signature[2]);
        result.children.push(signature[3]);
        if (this.tokIs(Operators.SEMICOLON)) {
            this.consume(Operators.SEMICOLON);
        }
        else {
            result.children.push(this.parseFunctionBlock());
        }
        this.currentFunctionNode = null;
        result.start = result.children.reduce((index, child) => {
            return Math.min(index, child ? child.start : Infinity);
        }, result.start);
        result.end = result.children.reduce((index, child) => {
            return Math.max(index, child ? child.end : 0);
        }, 0);
        return result;
    }
    /**
     * tok is { exit tok is the first tok after }
     *
     * @throws TokenException
     * @throws TokenException
     */
    parseFunctionBlock() {
        var block = new Node(this.scn.content, NodeKind.BLOCK, this.tok.index, -1);
        this.currentFunctionNode = block;
        this.parseBlock(block);
        return block;
    }
    parseFunctionCall(node) {
        var result = new Node(this.scn.content, NodeKind.CALL, node.start, -1);
        result.children.push(node);
        while (this.tokIs(Operators.LEFT_PARENTHESIS)) {
            result.children.push(this.parseArgumentList());
        }
        while (this.tokIs(Operators.LEFT_SQUARE_BRACKET)) {
            result.children.push(this.parseArrayLiteral());
        }
        result.end = result.children.reduce((index, child) => {
            return Math.max(index, child ? child.end : 0);
        }, 0);
        return result;
    }
    /**
     * tok is function exit tok is the first token after the optional ;
     *
     * @throws TokenException
     */
    parseFunctionSignature() {
        var signature = this.doParseSignature();
        this.skip(Operators.SEMICOLON, true);
        var result = new Node(this.scn.content, this.findFunctionTypeFromSignature(signature), signature[0].start, -1, signature[0].text);
        result.children.push(signature[1]);
        result.children.push(signature[2]);
        result.children.push(signature[3]);
        result.end = result.children.reduce((index, child) => {
            return Math.max(index, child ? child.end : 0);
        }, 0);
        //console.log('\n\nparseFunctionSignature()',result,'\n\n');
        return result;
    }
    /**
     * tok is if
     *
     * @throws TokenException
     */
    parseIf() {
        var tok = this.consume(KeyWords.IF);
        var result = new Node(this.scn.content, NodeKind.IF, tok.index, -1, null, [this.parseCondition()]);
        result.children.push(this.parseStatement());
        if (this.tokIs(KeyWords.ELSE)) {
            this.nextToken(true);
            result.children.push(this.parseStatement());
        }
        result.end = result.children.reduce((index, child) => {
            return Math.max(index, child ? child.end : 0);
        }, 0);
        return result;
    }
    /**
     * tok is implements implements a,b,c exit tok is the first token after the
     * list of qualfied names
     *
     * @throws TokenException
     */
    parseImplementsList() {
        this.consume(KeyWords.IMPLEMENTS);
        var result = new Node(this.scn.content, NodeKind.IMPLEMENTS_LIST, this.tok.index, -1);
        result.children.push(this.parseQualifiedName(NodeKind.IMPLEMENTS, true));
        while (this.tokIs(Operators.COMMA)) {
            this.nextToken(true);
            result.children.push(this.parseQualifiedName(NodeKind.IMPLEMENTS, true));
        }
        return result;
    }
    /**
     * tok is import
     *
     * @throws TokenException
     */
    parseImport() {
        var tok = this.consume(KeyWords.IMPORT);
        var name = this.parseImportName();
        var result = new Node(this.scn.content, NodeKind.IMPORT, tok.index, tok.index + name.length, name);
        this.skip(Operators.SEMICOLON);
        return result;
    }
    /**
     * tok is the first part of a name the last part can be a star exit tok is
     * the first token, which doesn't belong to the name
     *
     * @throws TokenException
     */
    parseImportName() {
        var result = '';
        result += this.tok.text;
        this.nextToken(true);
        while (this.tokIs(Operators.DOT)) {
            result += Operators.DOT;
            this.nextToken(true); // .
            result += this.tok.text;
            this.nextToken(true); // part of name
        }
        return result;
    }
    parseIncludeExpression() {
        var result = new Node(this.scn.content, NodeKind.INCLUDE, this.tok.index, -1);
        var tok;
        if (this.tokIs(KeyWords.INCLUDE)) {
            tok = this.consume(KeyWords.INCLUDE);
        }
        else if (this.tokIs(KeyWords.INCLUDE_AS2)) {
            tok = this.consume(KeyWords.INCLUDE_AS2);
        }
        if (tok) {
            result.start = tok.index;
        }
        result.children.push(this.parseExpression());
        result.end = result.children.reduce((index, child) => {
            return Math.max(index, child ? child.end : 0);
        }, 0);
        return result;
    }
    parseIncrement(node) {
        this.nextToken(true);
        var result = new Node(this.scn.content, NodeKind.POST_INC, node.start, this.tok.end);
        result.children.push(node);
        return result;
    }
    /**
     * tok is interface
     *
     * @param meta
     * @param modifier
     * @throws TokenException
     */
    parseInterface(meta, modifier) {
        var tok = this.consume(KeyWords.INTERFACE);
        var result = new Node(this.scn.content, NodeKind.INTERFACE, tok.index, -1);
        if (this.currentAsDoc != null) {
            result.children.push(this.currentAsDoc);
            this.currentAsDoc = null;
        }
        if (this.currentMultiLineComment != null) {
            result.children.push(this.currentMultiLineComment);
            this.currentMultiLineComment = null;
        }
        result.children.push(this.parseQualifiedName(NodeKind.NAME, true));
        result.children.push(this.convertMeta(meta));
        result.children.push(this.convertModifiers(modifier));
        if (this.tokIs(KeyWords.EXTENDS)) {
            this.nextToken(true); // extends
            result.children.push(this.parseQualifiedName(NodeKind.EXTENDS, false));
        }
        while (this.tokIs(Operators.COMMA)) {
            this.nextToken(true); // comma
            result.children.push(this.parseQualifiedName(NodeKind.EXTENDS, false));
        }
        this.consume(Operators.LEFT_CURLY_BRACKET);
        result.children.push(this.parseInterfaceContent());
        tok = this.consume(Operators.RIGHT_CURLY_BRACKET);
        result.end = tok.end;
        result.start = result.children.reduce((index, child) => {
            return Math.min(index, child ? child.start : Infinity);
        }, tok.index);
        return result;
    }
    /**
     * tok is function
     *
     * @throws TokenException
     */
    parseLambdaExpression() {
        var tok = this.consume(KeyWords.FUNCTION);
        var result;
        //if (this.tok.text.compareTo("(") == 0) {
        if (this.tok.text === "(") {
            result = new Node(this.scn.content, NodeKind.LAMBDA, tok.index, this.tok.end);
        }
        else {
            result = new Node(this.scn.content, NodeKind.FUNCTION, tok.index, this.tok.end, this.tok.text);
            this.nextToken(true);
        }
        result.children.push(this.parseParameterList());
        result.children.push(this.parseOptionalType());
        result.children.push(this.parseBlock());
        result.end = result.children.reduce((index, child) => {
            return Math.max(index, child ? child.end : 0);
        }, result.end);
        return result;
    }
    parseFile(filePath, content) {
        this.setFileName(filePath);
        this.scn = new AS3Scanner();
        this.scn.setContent(content);
        return this.parseCompilationUnit();
    }
    /**
     * tok is [ [id] [id ("test")] [id (name="test",type="a.b.c.Event")] exit
     * token is the first token after ]
     *
     * @throws TokenException
     */
    parseMetaData() {
        var buffer = '';
        var index = this.tok.index;
        var index = this.consume(Operators.LEFT_SQUARE_BRACKET).index;
        while (!this.tokIs(Operators.RIGHT_SQUARE_BRACKET)) {
            buffer += this.tok.text;
            this.nextToken(true);
        }
        var end = this.tok.end;
        this.skip(Operators.RIGHT_SQUARE_BRACKET);
        var metaDataNode = new Node(this.scn.content, NodeKind.META, index, end, '[' + buffer + ']');
        return metaDataNode;
    }
    parseMultiplicativeExpression() {
        var result = new Node(this.scn.content, NodeKind.MULTIPLICATION, this.tok.index, -1, null, [this.parseUnaryExpression()]);
        while (this.tokIs(Operators.TIMES) || this.tokIs(Operators.SLASH) || this.tokIs(Operators.MODULO)) {
            result.children.push(new Node(this.scn.content, NodeKind.OP, this.tok.index, this.tok.end, this.tok.text));
            this.nextToken(true);
            result.children.push(this.parseUnaryExpression());
        }
        result.end = result.children.reduce((index, child) => {
            return Math.max(index, child ? child.end : 0);
        }, result.end);
        return result.children.length > 1 ? result : result.children[0];
    }
    parseNamespaceName() {
        var name = this.tok.text;
        this.nextToken(true); // simple name for now
        return name;
    }
    parseNameTypeInit() {
        var result = new Node(this.scn.content, NodeKind.NAME_TYPE_INIT, this.tok.index, -1);
        result.children.push(new Node(this.scn.content, NodeKind.NAME, this.tok.index, this.tok.end, this.tok.text));
        this.nextToken(true); // name
        result.children.push(this.parseOptionalType());
        result.children.push(this.parseOptionalInit());
        result.end = result.children.reduce((index, child) => {
            return Math.max(index, child ? child.end : 0);
        }, result.end);
        return result;
    }
    parseNewExpression() {
        var tok = this.consume(KeyWords.NEW);
        var result = new Node(this.scn.content, NodeKind.NEW, tok.index, -1);
        result.children.push(this.parseExpression()); // name
        if (this.tokIs(Operators.VECTOR_START)) {
            var index = this.tok.index;
            var vec = this.parseVector();
            result.children.push(new Node(this.scn.content, NodeKind.VECTOR, index, vec.end, null, [vec]));
        }
        if (this.tokIs(Operators.LEFT_PARENTHESIS)) {
            result.children.push(this.parseArgumentList());
        }
        result.end = result.children.reduce((index, child) => {
            return Math.max(index, child ? child.end : 0);
        }, result.end);
        return result;
    }
    /**
     * tok is {
     */
    parseObjectLiteral() {
        var tok = this.consume(Operators.LEFT_CURLY_BRACKET);
        var result = new Node(this.scn.content, NodeKind.OBJECT, tok.index, tok.end);
        while (!this.tokIs(Operators.RIGHT_CURLY_BRACKET)) {
            result.children.push(this.parseObjectLiteralPropertyDeclaration());
            this.skip(Operators.COMMA, true);
        }
        tok = this.consume(Operators.RIGHT_CURLY_BRACKET);
        result.end = tok.end;
        return result;
    }
    /*
     * tok is name
     */
    parseObjectLiteralPropertyDeclaration() {
        var result = new Node(this.scn.content, NodeKind.PROP, this.tok.index, this.tok.end);
        var name = new Node(this.scn.content, NodeKind.NAME, this.tok.index, this.tok.end, this.tok.text);
        result.children.push(name);
        this.nextToken(true); // name
        this.consume(Operators.COLON);
        var expr = this.parseExpression();
        var val = new Node(this.scn.content, NodeKind.VALUE, expr.start, expr.end, null, [expr]);
        result.children.push(val);
        result.end = val.end;
        return result;
    }
    /**
     * if tok is "=" parse the expression otherwise do nothing
     *
     * @return
     */
    parseOptionalInit() {
        var result = null;
        if (this.tokIs(Operators.EQUAL)) {
            this.nextToken(true);
            var index = this.tok.index;
            var expr = this.parseExpression();
            result = new Node(this.scn.content, NodeKind.INIT, index, expr.end, null, [expr]);
        }
        return result;
    }
    /**
     * if tok is ":" parse the type otherwise do nothing
     *
     * @return
     * @throws TokenException
     */
    parseOptionalType() {
        var result = new Node(this.scn.content, NodeKind.TYPE, this.tok.index, this.tok.index, "");
        if (this.tokIs(Operators.COLON)) {
            this.nextToken(true);
            result = this.parseType();
        }
        return result;
    }
    parseOrExpression() {
        var result = new Node(this.scn.content, NodeKind.OR, this.tok.index, -1, null, [this.parseAndExpression()]);
        while (this.tokIs(Operators.LOGICAL_OR) || this.tokIs(Operators.LOGICAL_OR_AS2)) {
            result.children.push(new Node(this.scn.content, NodeKind.OP, this.tok.index, this.tok.end, this.tok.text));
            this.nextToken(true);
            result.children.push(this.parseAndExpression());
        }
        result.end = result.children.reduce((index, child) => {
            return Math.max(index, child ? child.end : 0);
        }, result.end);
        return result.children.length > 1 ? result : result.children[0];
    }
    /**
     * tok is package
     *
     * @throws UnExpectedTokenException
     */
    parsePackage() {
        var tok = this.consume(KeyWords.PACKAGE);
        var result = new Node(this.scn.content, NodeKind.PACKAGE, tok.index, -1);
        var nameBuffer = '';
        var index = this.tok.index;
        while (!this.tokIs(Operators.LEFT_CURLY_BRACKET)) {
            nameBuffer += this.tok.text;
            this.nextToken(true);
        }
        result.children.push(new Node(this.scn.content, NodeKind.NAME, index, index + nameBuffer.length, nameBuffer));
        this.consume(Operators.LEFT_CURLY_BRACKET);
        result.children.push(this.parsePackageContent());
        tok = this.consume(Operators.RIGHT_CURLY_BRACKET);
        result.end = tok.end;
        return result;
    }
    /**
     * tok is the name of a parameter or ...
     */
    parseParameter() {
        var result = new Node(this.scn.content, NodeKind.PARAMETER, this.tok.index, -1);
        if (this.tokIs(Operators.REST_PARAMETERS)) {
            var index = this.tok.index;
            this.nextToken(true); // ...
            var rest = new Node(this.scn.content, NodeKind.REST, index, this.tok.end, this.tok.text);
            this.nextToken(true); // rest
            // tsReplacement or tsTemplate may appear after ...rest
            var type = this.tsReplacement || 'Array' + (this.tsTemplate || '');
            rest.children.push(new Node(this.scn.content, NodeKind.TYPE, rest.end, rest.end, type));
            this.tsReplacement = null;
            this.tsTemplate = null;
            result.children.push(rest);
        }
        else {
            result.children.push(this.parseNameTypeInit());
        }
        result.end = result.children.reduce((index, child) => {
            return Math.max(index, child ? child.end : 0);
        }, result.end);
        return result;
    }
    /**
     * tok is (
     *
     * @throws TokenException
     */
    parseParameterList() {
        var tok = this.consume(Operators.LEFT_PARENTHESIS);
        var result = new Node(this.scn.content, NodeKind.PARAMETER_LIST, tok.index, -1);
        while (!this.tokIs(Operators.RIGHT_PARENTHESIS)) {
            result.children.push(this.parseParameter());
            if (this.tokIs(Operators.COMMA)) {
                this.nextToken(true);
            }
            else {
                break;
            }
        }
        tok = this.consume(Operators.RIGHT_PARENTHESIS);
        result.end = tok.end;
        return result;
    }
    /**
     * tok is first part of the name exit tok is the first token after the name
     *
     * @throws TokenException
     */
    parseQualifiedName(kind, skipPackage) {
        var index = this.tok.index;
        var buffer = '';
        var tsReplacement = this.tsReplacement;
        this.tsReplacement = null;
        buffer += this.tok.text;
        var nameEnd = this.tok.end;
        this.nextToken(true);
        while (this.tokIs(Operators.DOT) || this.tokIs(Operators.DOUBLE_COLON)) {
            buffer += this.tok.text;
            this.nextToken(true);
            buffer += this.tok.text;
            nameEnd = this.tok.end;
            this.nextToken(true); // name
        }
        if (tsReplacement)
            buffer = tsReplacement;
        else if (skipPackage)
            buffer = buffer.substring(buffer.lastIndexOf(Operators.DOT) + 1);
        if (this.tsTemplate)
            buffer += this.tsTemplate;
        this.tsTemplate = null;
        return new Node(this.scn.content, kind, index, nameEnd, buffer);
    }
    parseRelationalExpression() {
        var result = new Node(this.scn.content, NodeKind.RELATION, this.tok.index, -1, null, [this.parseShiftExpression()]);
        while (this.tokIs(Operators.LESSTHAN)
            || this.tokIs(Operators.LESSTHAN_AS2) || this.tokIs(Operators.LESSTHAN_EQUAL)
            || this.tokIs(Operators.LESSTHAN_EQUAL_AS2) || this.tokIs(Operators.GREATERTHAN)
            || this.tokIs(Operators.GREATERTHAN_AS2) || this.tokIs(Operators.GREATERTHAN_EQUAL)
            || this.tokIs(Operators.GREATERTHAN_EQUAL_AS2) || this.tokIs(KeyWords.IS) || this.tokIs(KeyWords.IN)
            && !this.isInFor || this.tokIs(KeyWords.AS) || this.tokIs(KeyWords.INSTANCE_OF)) {
            if (!this.tokIs(KeyWords.AS)) {
                result.children.push(new Node(this.scn.content, NodeKind.OP, this.tok.index, this.tok.end, this.tok.text));
            }
            else {
                result.children.push(new Node(this.scn.content, NodeKind.AS, this.tok.index, this.tok.end, this.tok.text));
            }
            this.nextToken(true);
            result.children.push(this.parseShiftExpression());
        }
        result.end = result.children.reduce((index, child) => {
            return Math.max(index, child ? child.end : 0);
        }, result.end);
        return result.children.length > 1 ? result : result.children[0];
    }
    parseReturnStatement() {
        var result;
        var index = this.tok.index, end = this.tok.end;
        this.nextTokenAllowNewLine();
        if (this.tokIs(NEW_LINE) || this.tokIs(Operators.SEMICOLON)) {
            this.nextToken(true);
            result = new Node(this.scn.content, NodeKind.RETURN, index, end, "");
        }
        else {
            var expr = this.parseExpression();
            result = new Node(this.scn.content, NodeKind.RETURN, index, expr.end, null, [expr]);
            this.skip(Operators.SEMICOLON);
        }
        return result;
    }
    parseThrowStatement() {
        var tok = this.consume(KeyWords.THROW);
        var expr = this.parseExpression();
        return new Node(this.scn.content, NodeKind.RETURN, tok.index, expr.end, null, [expr]);
        ;
    }
    parseBreakOrContinueStatement() {
        var tok = this.tok;
        var kind;
        if (this.tokIs(KeyWords.BREAK) || this.tokIs(KeyWords.CONTINUE)) {
            kind = this.tokIs(KeyWords.BREAK) ? NodeKind.BREAK : NodeKind.CONTINUE;
            this.nextToken(true);
        }
        else {
            this.unexpectedToken('continue or break');
        }
        var result;
        if (this.tokIs(NEW_LINE) || this.tokIs(Operators.SEMICOLON)) {
            this.nextToken(true);
            result = new Node(this.scn.content, kind, tok.index, tok.end, "");
        }
        else {
            var ident = this.tryParse(() => {
                var expr = this.parsePrimaryExpression();
                if (expr.kind === NodeKind.IDENTIFIER) {
                    return expr;
                }
                else {
                    throw new Error();
                }
            });
            if (!ident) {
                this.unexpectedToken('indent');
            }
            result = new Node(this.scn.content, kind, tok.index, ident.end, null, [ident]);
        }
        this.skip(Operators.SEMICOLON);
        return result;
    }
    parseShiftExpression() {
        var result = new Node(this.scn.content, NodeKind.SHIFT, this.tok.index, -1, null, [this.parseAdditiveExpression()]);
        while (this.tokIs(Operators.DOUBLE_SHIFT_LEFT)
            || this.tokIs(Operators.TRIPLE_SHIFT_LEFT) || this.tokIs(Operators.DOUBLE_SHIFT_RIGHT)
            || this.tokIs(Operators.TRIPLE_SHIFT_RIGHT)) {
            result.children.push(new Node(this.scn.content, NodeKind.OP, this.tok.index, this.tok.end, this.tok.text));
            this.nextToken(true);
            result.children.push(this.parseAdditiveExpression());
        }
        result.end = result.children.reduce((index, child) => {
            return Math.max(index, child ? child.end : 0);
        }, result.end);
        return result.children.length > 1 ? result : result.children[0];
    }
    /**
     * tok is switch
     *
     * @throws TokenException
     */
    parseSwitch() {
        var tok = this.consume(KeyWords.SWITCH);
        var result = new Node(this.scn.content, NodeKind.SWITCH, tok.index, tok.end, null, [this.parseCondition()]);
        if (this.tokIs(Operators.LEFT_CURLY_BRACKET)) {
            this.nextToken(true);
            result.children.push(this.parseSwitchCases());
            result.end = this.consume(Operators.RIGHT_CURLY_BRACKET).end;
        }
        return result;
    }
    /**
     * tok is case, default or the first token of the first statement
     *
     * @throws TokenException
     */
    parseSwitchBlock() {
        var result = new Node(this.scn.content, NodeKind.SWITCH_BLOCK, this.tok.index, this.tok.end);
        while (!this.tokIs(KeyWords.CASE) && !this.tokIs(KeyWords.DEFAULT) && !this.tokIs(Operators.RIGHT_CURLY_BRACKET)) {
            result.children.push(this.parseStatement());
        }
        result.end = result.children.reduce((index, child) => {
            return Math.max(index, child ? child.end : 0);
        }, result.end);
        return result;
    }
    /**
     * tok is { exit tok is }
     *
     * @throws TokenException
     */
    parseSwitchCases() {
        var result = new Node(this.scn.content, NodeKind.CASES, this.tok.index, this.tok.end);
        for (;;) {
            if (this.tokIs(Operators.RIGHT_CURLY_BRACKET)) {
                break;
            }
            else if (this.tokIs(KeyWords.CASE)) {
                var index = this.tok.index;
                this.nextToken(true); // case
                var expr = this.parseExpression();
                var caseNode = new Node(this.scn.content, NodeKind.CASE, index, expr.end, null, [expr]);
                this.consume(Operators.COLON);
                var block = this.parseSwitchBlock();
                caseNode.children.push(block);
                caseNode.end = block.end;
                result.children.push(caseNode);
            }
            else if (this.tokIs(KeyWords.DEFAULT)) {
                var index = this.tok.index;
                this.nextToken(true); // default
                this.consume(Operators.COLON);
                var caseNode = new Node(this.scn.content, NodeKind.CASE, index, -1, null, [new Node(this.scn.content, NodeKind.DEFAULT, index, this.tok.end, KeyWords.DEFAULT)]);
                var block = this.parseSwitchBlock();
                caseNode.end = block.end;
                caseNode.children.push(block);
                result.children.push(caseNode);
            }
        }
        result.end = result.children.reduce((index, child) => {
            return Math.max(index, child ? child.end : 0);
        }, result.end);
        return result;
    }
    /**
     * tok is ( for( var x : number = 0; i < length; i++ ) for( var s : string in
     * Object )
     *
     * @throws TokenException
     */
    parseTraditionalFor(index) {
        this.consume(Operators.LEFT_PARENTHESIS);
        var result = new Node(this.scn.content, NodeKind.FOR, index, -1);
        if (!this.tokIs(Operators.SEMICOLON)) {
            if (this.tokIs(KeyWords.VAR)) {
                var varList = this.parseVarList(null, null);
                result.children.push(new Node(this.scn.content, NodeKind.INIT, varList.start, varList.end, null, [varList]));
            }
            else {
                this.isInFor = true;
                var expr = this.parseExpressionList();
                result.children.push(new Node(this.scn.content, NodeKind.INIT, expr.start, expr.end, null, [expr]));
                this.isInFor = false;
            }
            if (this.tokIs(NodeKind.IN)) {
                return this.parseForIn(result);
            }
        }
        this.consume(Operators.SEMICOLON);
        if (!this.tokIs(Operators.SEMICOLON)) {
            var expr = this.parseExpression();
            result.children.push(new Node(this.scn.content, NodeKind.COND, expr.start, expr.end, null, [expr]));
        }
        this.consume(Operators.SEMICOLON);
        if (!this.tokIs(Operators.RIGHT_PARENTHESIS)) {
            var expr = this.parseExpressionList();
            result.children.push(new Node(this.scn.content, NodeKind.ITER, expr.start, expr.end, null, [expr]));
        }
        this.consume(Operators.RIGHT_PARENTHESIS);
        result.children.push(this.parseStatement());
        return result;
    }
    parseTry() {
        var result;
        var index = this.tok.index;
        this.nextToken(true);
        var block = this.parseBlock();
        result = new Node(this.scn.content, NodeKind.TRY, index, block.end, null, [block]);
        return result;
    }
    parseType() {
        var result;
        if (this.tok.text === VECTOR) {
            result = this.parseVector();
        }
        else {
            result = this.parseQualifiedName(NodeKind.TYPE, true);
        }
        return result;
    }
    parseUnaryExpressionNotPlusMinus() {
        var result;
        var index = this.tok.index;
        if (this.tokIs(KeyWords.DELETE)) {
            this.nextToken(true);
            var expr = this.parseExpression();
            result = new Node(this.scn.content, NodeKind.DELETE, index, expr.end, null, [expr]);
        }
        else if (this.tokIs(KeyWords.VOID)) {
            this.nextToken(true);
            var expr = this.parseExpression();
            result = new Node(this.scn.content, NodeKind.VOID, index, expr.end, null, [expr]);
        }
        else if (this.tokIs(KeyWords.TYPEOF)) {
            this.nextToken(true);
            var expr = this.parseExpression();
            result = new Node(this.scn.content, NodeKind.TYPEOF, index, expr.end, null, [expr]);
        }
        else if (this.tokIs("!") || this.tokIs("not")) {
            this.nextToken(true);
            var expr = this.parseExpression();
            result = new Node(this.scn.content, NodeKind.NOT, index, expr.end, null, [expr]);
        }
        else if (this.tokIs("~")) {
            this.nextToken(true);
            var expr = this.parseExpression();
            result = new Node(this.scn.content, NodeKind.B_NOT, index, expr.end, null, [expr]);
        }
        else {
            result = this.parseUnaryPostfixExpression();
        }
        return result;
    }
    parseUnaryPostfixExpression() {
        var node = this.parseAccessExpresion();
        if (this.tokIs(Operators.INCREMENT)) {
            node = this.parseIncrement(node);
        }
        else if (this.tokIs(Operators.DECREMENT)) {
            node = this.parseDecrement(node);
        }
        return node;
    }
    parseAccessExpresion() {
        var node = this.parsePrimaryExpression();
        while (true) {
            if (this.tokIs(Operators.LEFT_PARENTHESIS)) {
                node = this.parseFunctionCall(node);
            }
            if (this.tokIs(Operators.DOT) || this.tokIs(Operators.DOUBLE_COLON)) {
                node = this.parseDot(node);
            }
            else if (this.tokIs(Operators.LEFT_SQUARE_BRACKET)) {
                node = this.parseArrayAccessor(node);
            }
            else {
                break;
            }
        }
        return node;
    }
    parseUse() {
        var tok = this.consume(KeyWords.USE);
        this.consume(KeyWords.NAMESPACE);
        var nameIndex = this.tok.index;
        var namespace = this.parseNamespaceName();
        var result = new Node(this.scn.content, NodeKind.USE, tok.index, nameIndex + namespace.length, namespace);
        this.skip(Operators.SEMICOLON);
        return result;
    }
    parseVar() {
        var result;
        result = this.parseVarList(null, null);
        this.skip(Operators.SEMICOLON);
        return result;
    }
    /**
     * tok is var var x, y : String, z : number = 0;
     *
     * @param modifiers
     * @param meta
     * @throws TokenException
     */
    parseVarList(meta, modifiers) {
        var tok = this.consume(KeyWords.VAR);
        var result = new Node(this.scn.content, NodeKind.VAR_LIST, tok.index, tok.end);
        result.children.push(this.convertMeta(meta));
        result.children.push(this.convertModifiers(modifiers));
        this.collectVarListContent(result);
        result.start = result.children.reduce((index, child) => {
            return Math.min(index, child ? child.start : Infinity);
        }, tok.index);
        result.end = result.children.reduce((index, child) => {
            return Math.max(index, child ? child.end : 0);
        }, tok.end);
        return result;
    }
    parseVector() {
        var result = new Node(this.scn.content, NodeKind.VECTOR, this.tok.index, -1, "");
        if (this.tok.text === "Vector") {
            this.nextToken(true);
        }
        this.consume(Operators.VECTOR_START);
        result.children.push(this.parseType());
        result.end = this.consume(Operators.GREATERTHAN).end;
        return result;
    }
    parseShortVector() {
        var vector = new Node(this.scn.content, NodeKind.VECTOR, this.tok.index, -1, "");
        this.consume(Operators.LESSTHAN);
        vector.children.push(this.parseType());
        vector.end = this.consume(Operators.GREATERTHAN).end;
        var arrayLiteral = this.parseArrayLiteral();
        return new Node(this.scn.content, NodeKind.SHORT_VECTOR, vector.start, arrayLiteral.end, null, [vector, arrayLiteral]);
    }
    /**
     * tok is while
     *
     * @throws TokenException
     */
    parseWhile() {
        var tok = this.consume(KeyWords.WHILE);
        var result = new Node(this.scn.content, NodeKind.WHILE, tok.index, tok.end);
        result.children.push(this.parseCondition());
        result.children.push(this.parseStatement());
        result.end = result.children.reduce((index, child) => {
            return Math.max(index, child ? child.end : 0);
        }, tok.end);
        return result;
    }
    setFileName(fileNameToParse) {
        this.fileName = fileNameToParse;
    }
    /**
     * Skip the current token, if it equals to the parameter
     *
     * @param text
     * @throws UnExpectedTokenException
     */
    skip(text, ignoreDocumentation = false) {
        if (this.tokIs(text)) {
            this.nextToken(ignoreDocumentation);
        }
    }
    /**
     * Compare the current token to the parameter
     *
     * @param text
     * @return true, if tok's text property equals the parameter
     */
    tokIs(text) {
        return this.tok.text === text;
    }
    tryToParseCommentNode(result, modifiers) {
        if (startsWith(this.tok.text, ASDOC_COMMENT)) {
            this.currentAsDoc = new Node(this.scn.content, NodeKind.AS_DOC, this.tok.index, -1, this.tok.text);
            this.nextToken();
        }
        else if (startsWith(this.tok.text, MULTIPLE_LINES_COMMENT)) {
            result.children.push(new Node(this.scn.content, NodeKind.MULTI_LINE_COMMENT, this.tok.index, -1, this.tok.text));
            this.nextToken();
        }
        else {
            if (modifiers != null) {
                modifiers.push(this.tok);
            }
            this.nextToken(true);
        }
    }
    unexpectedToken(expected) {
        var pos = getLineAndCharacterFromPosition(this.tok.index, this.lineMap);
        throw new Error('unexpected token: ' + this.tok.text + ' expected: ' + expected + ' in file ' + this.fileName + '(' + pos.line + ',' + pos.col + ')');
    }
}
module.exports = AS3Parser;
