/*jshint node:true*/

import AS3Parser = require('./parser');
import emitter = require('./emitter');
import fs = require('fs');
import path = require('path');
import child_process = require('child_process');
import fs_extra = require('fs-extra');
import rimraf = require('rimraf');

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
    return flatten<string>(fs.readdirSync(dir).map(function (file) {
        var fileName = path.join(prefix, file);
        var filePath = path.join(dir, file);
        return fs.statSync(filePath).isDirectory() ? <any> readdir(filePath, fileName) : <any> fileName;
    }));
}

function displayHelp() {
    console.log('usage: as2dts [--defs-only] [--out-name <name>] <sourceDir> <outputDir>');
}

function tsc(...args:string[]) {
    var cmd = process.cwd().indexOf('/') < 0 ? 'tsc.cmd' : 'tsc';
    cmd = path.join(path.dirname(process.argv[1]), '../node_modules/.bin/', cmd);
    var result = child_process.spawnSync(
        cmd,
        args,
        {
            cwd: process.cwd(),
            env: process.env,
            stdio: 'inherit'
        }
    );
    if (result.error)
        throw result.error;
    return result;
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
        rimraf.sync(outputDir);
    }
    fs.mkdirSync(outputDir);
    
    var files = readdir(sourceDir).filter(file => /.as$/.test(file));
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
        (<any>fs).createFileSync(path.resolve(outputDir, file.replace(/.as$/, '.ts')), emitter.emit(ast, content, {defsOnly: defsOnly}));
        number ++;
    });

    if (defsOnly)
    {
        (fs as any).createFileSync(
            path.join(outputDir, 'tsconfig.json'),
            `{
                "compilerOptions": {
                    "noImplicitAny": true,
                    "module": "system",
                    "declaration": true,
                    "target": "es6",
                    "outFile": "${outputName}.js"
                },
                "exclude": ["${outputName}.d.ts", "${outputName}.js"]
            }`
        );
        tsc('-d', '-p', outputDir);
    }
}
