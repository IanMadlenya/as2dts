#as2dts

> A tool that helps porting as3 codebase to typescript


##Installation

Install this module with npm: 

```
npm install -g as2dts
```

##Usage

```
as2dts [--defs-only] <sourceDir> <outputDir>
```

##Note

This tool will not magically transform your as3 codebase into perfect typescript, the goal is to transform the sources into *syntactically* correct typescript, and even this goal is not perfectly respected. It also won't try to provide javascript implementation for flash libraries.

However unlike most attempts that I have seen this tool is based on a true actionscript parser, and so should be able to handle most of as3 constructs and greatly ease the pain of porting a large code base written in as3 to typescript.

##Command-line help

Compile:
```
npm run-script compile
```

Install on command-line:
```
npm install -g
```

Install debugger:
```
npm install -g node-inspector
```

Start debugging service:
```
node-inspector -p 8081 &
```

Debug:
```
node-debug bin/as2dts [--defs-only] <sourceDir> <outputDir>
```
