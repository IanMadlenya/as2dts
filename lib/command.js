/*jshint node:true*/
"use strict";
const AS3Parser = require('./parser');
const emitter = require('./emitter');
const fs = require('fs-extra');
const path = require('path');
const child_process = require('child_process');
function flatten(arr) {
    return arr.reduce(function (result, val) {
        if (Array.isArray(val)) {
            result.push.apply(result, flatten(val));
        }
        else {
            result.push(val);
        }
        return result;
    }, []);
}
function readdir(dir, prefix = '') {
    return flatten(fs.readdirSync(dir).map(function (file) {
        var fileName = path.join(prefix, file);
        var filePath = path.join(dir, file);
        return fs.statSync(filePath).isDirectory() ? readdir(filePath, fileName) : fileName;
    }));
}
function displayHelp() {
    console.log('usage: as2dts [--defs-only] [--out-name <name>] <sourceDir> <outputDir>');
}
function tsc(...args) {
    var cmd = process.cwd().indexOf('/') < 0 ? 'tsc.cmd' : 'tsc';
    var cmdPath = null;
    // BEGIN HACK
    // process.argv[1] could be in node_modules/as2dts/bin/as2dts or node_modules/.bin/as2dts
    // check for node_modules/as2dts/node_modules/.bin/tsc[.cmd] or node_modules/.bin/tsc[.cmd]
    for (let subpath of [
        '../node_modules/.bin/',
        '../as2dts/node_modules/.bin/',
        './',
        '../../.bin/'
    ]) {
        cmdPath = path.join(path.dirname(process.argv[1]), '../node_modules/.bin/', cmd);
        if (fs.existsSync(cmdPath))
            break;
    }
    // END HACK
    var result = child_process.spawnSync(cmdPath, args, {
        cwd: process.cwd(),
        env: process.env,
        stdio: 'inherit'
    });
    if (result.error)
        throw result.error;
    return result;
}
function run() {
    if (process.argv.length === 2) {
        displayHelp();
        process.exit(0);
    }
    var iArg = 2;
    var defsOnly = false;
    var outputName = 'out';
    while (true) {
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
        fs.outputFileSync(path.resolve(outputDir, file.replace(/.as$/, '.ts')), emitter.emit(ast, content, { defsOnly: defsOnly }));
        number++;
    });
    if (defsOnly) {
        fs.outputFileSync(path.join(outputDir, 'tsconfig.json'), `{
                "compilerOptions": {
                    "noImplicitAny": true,
                    "module": "system",
                    "declaration": true,
                    "target": "es6",
                    "outFile": "${outputName}.js"
                },
                "exclude": ["${outputName}.d.ts", "${outputName}.js"]
            }`);
        tsc('-d', '-p', outputDir);
    }
}
exports.run = run;
