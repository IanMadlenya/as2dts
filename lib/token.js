"use strict";
class Token {
    constructor(text, index, isNumeric = false, isXML = false) {
        this.text = text;
        this.index = index;
        this.isNumeric = isNumeric;
        this.isXML = isXML;
    }
    get end() {
        return this.index + this.text.length;
    }
}
module.exports = Token;
