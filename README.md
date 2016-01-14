#as3-to-typescript

> A tool that helps porting as3 codebase to typescript


##Installation

Install this module with npm: 

```
npm install -g as3-to-typescript
```

##Usage

```
as3-to-typescript <sourceDir> <outputDir>
```

##Note

This tool will not magically transform your as3 codebase into perfect typescript, the goal is to transform the sources into *syntactically* correct typescript, and even this goal is not perfectly respected. It also won't try to provide javascript implementation for flash libraries.

However unlike most attempts that I have seen this tool is based on a true actionscript parser, and so should be able to handle most of as3 constructs and greatly ease the pain of porting a large code base written in as3 to typescript.

To compile and test from source:
npm run-script compile && npm install -g