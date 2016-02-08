/*jshint node:true*/
var AS3Parser = require('./parser');
var emitter = require('./emitter');
var fs = require('fs');
var path = require('path');
require('fs-extended');
var rimraf = require('rimraf');
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
function readdir(dir, prefix) {
    if (prefix === void 0) { prefix = ''; }
    return flatten(fs.readdirSync(dir).map(function (file) {
        var fileName = path.join(prefix, file);
        var filePath = path.join(dir, file);
        return fs.statSync(filePath).isDirectory() ? readdir(filePath, fileName) : fileName;
    }));
}
function displayHelp() {
    console.log('usage: as3-to-typescript [--defs-only] <sourceDir> <outputDir>');
}
function run() {
    if (process.argv.length === 2) {
        displayHelp();
        process.exit(0);
    }
    var iArg = 2;
    var defsOnly = false;
    if (process.argv[iArg] === '--defs-only')
        defsOnly = true, iArg++;
    if (process.argv.length - iArg != 2) {
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
            process.exit(1);
        }
        rimraf.sync(outputDir);
    }
    fs.mkdirSync(outputDir);
    var files = readdir(sourceDir).filter(function (file) { return /.as$/.test(file); });
    var number = 0;
    var length = files.length;
    files.forEach(function (file) {
        var parser = new AS3Parser();
        console.log('compiling \'' + file + '\' ' + number + '/' + length);
        var content = fs.readFileSync(path.resolve(sourceDir, file), 'UTF-8');
        //console.log('parsing');
        var ast = parser.buildAst(path.basename(file), content);
        //console.log(JSON.stringify(ast,null,3));
        //console.log('emitting');
        fs.createFileSync(path.resolve(outputDir, file.replace(/.as$/, '.ts')), emitter.emit(ast, content, { defsOnly: defsOnly }));
        number++;
    });
}
exports.run = run;
if (process['_debugProcess'])
    run();
