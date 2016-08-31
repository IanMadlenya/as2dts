/*jshint node:true*/

import AS3Parser = require('./parser');
import emitter = require('./emitter');
import fs = require('fs-extra');
import path = require('path');
import child_process = require('child_process');
import ts = require('typescript');

function flatten<T>(arr: any): T[] {
  return arr.reduce(function (result: T[], val: any) {
    if (Array.isArray(val)) {
      result.push.apply(result, flatten(val));
    } else {
      result.push(val);
    }
    return result;
  }, <T[]>[]);
}

function readdir(dir: string, prefix = ''): string[] {
    return flatten<string>(fs.readdirSync(dir).map(function (file:string) {
        var fileName = path.join(prefix, file);
        var filePath = path.join(dir, file);
        return fs.statSync(filePath).isDirectory() ? readdir(filePath, fileName) : fileName;
    }));
}

function displayHelp() {
    console.log('usage: as2dts [--defs-only] [--out-name <name>] <sourceDir> <outputDir>');
}

export function run() {
	
    if (process.argv.length === 2) {
        displayHelp();
        process.exit(0);
    }
	
	var iArg:number = 2;
    var defsOnly:boolean = false;
    var outputName = 'out';

    while (true)
    {
        var option = process.argv[iArg];
        if (option === '--defs-only')
            defsOnly = true;
        else if (option === '--out-name')
            outputName = process.argv[++iArg];
        else
            break;
        iArg++;
    }

    if (process.argv.length - iArg < 2) {
		displayHelp();
        process.exit(1);
    }
	
    var sourceDir = path.resolve(process.cwd(), process.argv[iArg++]);
    if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
        throw new Error('invalid source dir');
    }
    
    var outputDir = path.resolve(process.cwd(), process.argv[iArg++]);
    if (fs.existsSync(outputDir)) {
        if (!fs.statSync(outputDir).isDirectory()) {
            throw new Error('invalid ouput dir');
        }
        fs.removeSync(outputDir);
    }
    fs.mkdirpSync(outputDir);
    
    var files = readdir(sourceDir).filter(file => /.as$/.test(file));
    var tsFiles:string[] = [];
    var number = 0;
    var length = files.length;
    files.forEach(function (file) {
        var parser = new AS3Parser();
        console.log('compiling', file, (number + 1) + '/' + length);
        var content = fs.readFileSync(path.resolve(sourceDir, file), 'UTF-8');
        //console.log('parsing');
        var ast = parser.buildAst(path.basename(file), content);
		//console.log(JSON.stringify(ast,null,3));
        //console.log('emitting');
        var tsFile = path.resolve(outputDir, file.replace(/.as$/, '.ts'));
        tsFiles.push(tsFile);
        fs.outputFileSync(tsFile, emitter.emit(ast, content, {defsOnly: defsOnly}));
        number ++;
    });

    if (defsOnly)
    {
        compile(
            tsFiles,
            {
                "noImplicitAny": true,
                "module": ts.ModuleKind.System,
                "declaration": true,
                "target": ts.ScriptTarget.ES6,
                "outFile": path.resolve(outputDir, outputName + '.js')
            }
        );
    }
}

function compile(fileNames: string[], options: ts.CompilerOptions): void {
    let program = ts.createProgram(fileNames, options);
    let emitResult = program.emit();

    let allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);

    allDiagnostics.forEach(diagnostic => {
        let { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
        let message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        console.log(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
    });

    if (emitResult.emitSkipped)
        console.log("Failed to create .d.ts file.");
}
