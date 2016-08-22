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
const Token = require('./token');
var sax = require('sax');
var END = '__END__';
function isDecimalChar(currentCharacter) {
    return currentCharacter >= '0' && currentCharacter <= '9';
}
function endsWith(string, suffix) {
    return string.indexOf(suffix, string.length - suffix.length) !== -1;
}
;
function verifyXML(string) {
    var parser = sax.parser(true);
    try {
        parser.write(string).close();
        return true;
    }
    catch (e) {
        return false;
    }
}
/**
 * convert a actionscript to a stream of tokens
 *
 * @author rbokel
 * @author xagnetti
 */
class AS3Scanner {
    constructor() {
        this.content = '';
    }
    /**
     * @return
     */
    moveToNextToken() {
        return this.nextToken();
    }
    /**
     * @param linesToBeSet
     */
    setContent(content) {
        this.content = content;
        this.index = -1;
    }
    isHexChar(currentCharacter) {
        return (currentCharacter >= '0' && currentCharacter <= '9') ||
            (currentCharacter >= 'A' && currentCharacter <= 'Z') ||
            (currentCharacter >= 'a' && currentCharacter <= 'z');
    }
    /**
     * @return
     */
    nextToken() {
        var currentCharacter;
        if (this.content != null && this.index < this.content.length) {
            currentCharacter = this.nextNonWhitespaceCharacter();
        }
        else {
            return new Token(END, this.index);
        }
        if (currentCharacter === '\n') {
            return new Token('\n', this.index);
        }
        else if (currentCharacter === '/') {
            return this.scanCommentRegExpOrOperator();
        }
        else if (currentCharacter === '"') {
            return this.scanString(currentCharacter);
        }
        else if (currentCharacter === '\'') {
            return this.scanString(currentCharacter);
        }
        else if (currentCharacter === '<') {
            return this.scanXMLOrOperator(currentCharacter);
        }
        else if (currentCharacter >= '0' && currentCharacter <= '9' || currentCharacter === '.') {
            return this.scanNumberOrDots(currentCharacter);
        }
        else if (currentCharacter === '{' || currentCharacter === '}' || currentCharacter === '(' ||
            currentCharacter === ')' || currentCharacter === '[' || currentCharacter === ']' ||
            currentCharacter === ';' || currentCharacter === ',' || currentCharacter === '?' ||
            currentCharacter === '~') {
            return this.scanSingleCharacterToken(currentCharacter);
        }
        else if (currentCharacter === ':') {
            return this.scanCharacterSequence(currentCharacter, ['::']);
        }
        else if (currentCharacter === '*') {
            //UGLY HACK but .... seems working
            if (this.getPreviousCharacter() !== ':') {
                return this.scanCharacterSequence(currentCharacter, ['*=']);
            }
            else {
                return new Token('*', this.index);
            }
        }
        else if (currentCharacter === '+') {
            return this.scanCharacterSequence(currentCharacter, ['++', '+=']);
        }
        else if (currentCharacter === '-') {
            return this.scanCharacterSequence(currentCharacter, ['--', '-=']);
        }
        else if (currentCharacter === '%') {
            return this.scanCharacterSequence(currentCharacter, ['%=']);
        }
        else if (currentCharacter === '&') {
            return this.scanCharacterSequence(currentCharacter, ['&&', '&=']);
        }
        else if (currentCharacter === '|') {
            return this.scanCharacterSequence(currentCharacter, ['||', '|=']);
        }
        else if (currentCharacter === '^') {
            return this.scanCharacterSequence(currentCharacter, ['^=']);
        }
        else if (currentCharacter === '>') {
            if (this.inVector) {
                this.inVector = false;
            }
            else {
                return this.scanCharacterSequence(currentCharacter, ['>>>=', '>>>', '>>=', '>>', '>=']);
            }
        }
        else if (currentCharacter === '=') {
            return this.scanCharacterSequence(currentCharacter, ['===', '==']);
        }
        else if (currentCharacter === '!') {
            return this.scanCharacterSequence(currentCharacter, ['!==', '!=']);
        }
        var token = this.scanWord(currentCharacter);
        return token.text.length === 0 ? this.nextToken() : token;
    }
    scanRegExp() {
        var currentIndex = this.index;
        var token = this.scanUntilDelimiter('/');
        var peekPos = 1;
        var flagBuffer = '';
        for (;;) {
            var currentCharacter = this.peekChar(peekPos++);
            if (/[a-z]/.test(currentCharacter)) {
                flagBuffer += currentCharacter;
            }
            else {
                break;
            }
        }
        if (flagBuffer.length) {
            token.text += flagBuffer;
            this.index += flagBuffer.length;
        }
        if (token != null && this.isValidRegExp(token.text)) {
            return token;
        }
        else {
            this.index = currentIndex;
        }
        return null;
    }
    getCheckPoint() {
        return { index: this.index, inVector: this.inVector };
    }
    rewind(checkpoint) {
        this.index = checkpoint.index;
        this.inVector = checkpoint.inVector;
    }
    computePossibleMatchesMaxLength(possibleMatches) {
        return possibleMatches.reduce((max, possibleMatch) => {
            return Math.max(max, possibleMatch.length);
        }, 0);
    }
    getPreviousCharacter() {
        var currentIndex = -1, currentChar;
        do {
            currentChar = this.peekChar(currentIndex--);
        } while (currentChar == ' ');
        return currentChar;
    }
    isIdentifierCharacter(currentCharacter) {
        return currentCharacter >= 'A' && currentCharacter <= 'Z' || currentCharacter >= 'a' &&
            currentCharacter <= 'z' || currentCharacter >= '0' &&
            currentCharacter <= '9' || currentCharacter === '_' || currentCharacter === '$';
    }
    isProcessingInstruction(text) {
        return text.indexOf('<?') === 0;
    }
    isValidRegExp(pattern) {
        try {
            return eval(pattern) instanceof RegExp;
        }
        catch (e) {
            return false;
        }
    }
    nextChar() {
        this.index++;
        var currentChar = this.content.charAt(this.index);
        while (currentChar == '\uFEFF') {
            this.index++;
            currentChar = this.content.charAt(this.index);
        }
        return currentChar;
    }
    nextNonWhitespaceCharacter() {
        var result;
        do {
            result = this.nextChar();
        } while (result == ' ' || result == '\t' || result.charCodeAt(0) == 13);
        return result;
    }
    peekChar(offset) {
        var index = this.index + offset;
        if (index == -1) {
            return '\0';
        }
        return this.content.charAt(index);
    }
    /**
     * find the longest matching sequence
     *
     * @param currentCharacter
     * @param possibleMatches
     * @param maxLength
     * @return
     */
    scanCharacterSequence(currentCharacter, possibleMatches) {
        var peekPos = 1;
        var buffer = '';
        var maxLength = this.computePossibleMatchesMaxLength(possibleMatches);
        buffer += currentCharacter;
        var found = buffer.toString();
        while (peekPos < maxLength) {
            buffer += this.peekChar(peekPos);
            peekPos++;
            for (var i = 0; i < possibleMatches.length; i++) {
                var possibleMatche = possibleMatches[i];
                if (buffer.toString() === possibleMatche) {
                    found = buffer.toString();
                }
            }
        }
        var result = new Token(found, this.index);
        this.skipChars(found.length - 1);
        return result;
    }
    /**
     * Something started with a slash This might be a comment, a regexp or a
     * operator
     *
     * @param currentCharacter
     * @return
     */
    scanCommentRegExpOrOperator() {
        var firstCharacter = this.peekChar(1);
        if (firstCharacter == '/') {
            return this.scanSingleLineComment();
        }
        if (firstCharacter == '*') {
            return this.scanMultiLineComment();
        }
        var result;
        if (firstCharacter == '=') {
            result = new Token('/=', this.index);
            this.skipChars(1);
            return result;
        }
        result = new Token('/', this.index);
        return result;
    }
    /**
     * c is either a dot or a number
     *
     * @return
     */
    scanDecimal(currentCharacter) {
        var currentChar = currentCharacter;
        var buffer = '';
        var peekPos = 1;
        while (isDecimalChar(currentChar)) {
            buffer += currentChar;
            currentChar = this.peekChar(peekPos++);
        }
        if (currentChar == '.') {
            buffer += currentChar;
            currentChar = this.peekChar(peekPos++);
            while (isDecimalChar(currentChar)) {
                buffer += currentChar;
                currentChar = this.peekChar(peekPos++);
            }
            if (currentChar == 'E') {
                buffer += currentChar;
                currentChar = this.peekChar(peekPos++);
                while (isDecimalChar(currentChar)) {
                    buffer += currentChar;
                    currentChar = this.peekChar(peekPos++);
                }
            }
        }
        var result = new Token(buffer.toString(), this.index, true);
        this.skipChars(result.text.length - 1);
        return result;
    }
    /**
     * The first dot has been scanned Are the next chars dots as well?
     *
     * @return
     */
    scanDots() {
        var secondCharacter = this.peekChar(1);
        if (secondCharacter == '.') {
            var thirdCharacter = this.peekChar(2);
            var text = thirdCharacter == '.' ? '...'
                : '..';
            var result = new Token(text, this.index);
            this.skipChars(text.length - 1);
            return result;
        }
        else if (secondCharacter == '<') {
            var result = new Token('.<', this.index);
            this.skipChars(1);
            this.inVector = true;
            return result;
        }
        return null;
    }
    /**
     * we have seen the 0x prefix
     *
     * @return
     */
    scanHex() {
        var buffer = '';
        buffer += '0x';
        var peekPos = 2;
        for (;;) {
            var character = this.peekChar(peekPos++);
            if (!this.isHexChar(character)) {
                break;
            }
            buffer += character;
        }
        var result = new Token(buffer, this.index, true);
        this.skipChars(result.text.length - 1);
        return result;
    }
    /**
     * the current string is the first slash plus we know, that a * is following
     *
     * @return
     */
    scanMultiLineComment() {
        var buffer = '';
        var currentCharacter = ' ';
        var previousCharacter = ' ';
        buffer += '/*';
        this.skipChar();
        do {
            previousCharacter = currentCharacter;
            currentCharacter = this.nextChar();
            buffer += currentCharacter;
        } while (currentCharacter && !(currentCharacter === '/' && previousCharacter == '*'));
        return new Token(buffer.toString(), this.index);
    }
    /**
     * Something started with a number or a dot.
     *
     * @param characterToBeScanned
     * @return
     */
    scanNumberOrDots(characterToBeScanned) {
        if (characterToBeScanned == '.') {
            var result = this.scanDots();
            if (result != null) {
                return result;
            }
            var firstCharacter = this.peekChar(1);
            if (!isDecimalChar(firstCharacter)) {
                return new Token('.', this.index);
            }
        }
        if (characterToBeScanned == '0') {
            var firstCharacter = this.peekChar(1);
            if (firstCharacter == 'x' || firstCharacter == 'X') {
                return this.scanHex();
            }
        }
        return this.scanDecimal(characterToBeScanned);
    }
    scanSingleCharacterToken(character) {
        return new Token(character, this.index);
    }
    /**
     * the current string is the first slash plus we know, that another slash is
     * following
     *
     * @return
     */
    scanSingleLineComment() {
        /*var result: Token = new Token(this.lines[this.line].substring(this.column), this.index);
        this.skipChars(result.text.length - 1);
        return result;*/
        var char, buffer = this.content[this.index];
        do {
            char = this.nextChar();
            buffer += char;
        } while (char && char !== '\n');
        return new Token(buffer.toString(), this.index);
    }
    /**
     * Something started with a quote or number quote consume characters until
     * the quote/double quote shows up again and is not escaped
     *
     * @param startingCharacter
     * @return
     */
    scanString(startingCharacter) {
        return this.scanUntilDelimiter(startingCharacter);
    }
    scanUntilDelimiter(start, delimiter) {
        if (typeof delimiter === 'undefined') {
            delimiter = start;
        }
        var buffer = '';
        ;
        var peekPos = 1;
        var numberOfBackslashes = 0;
        buffer += start;
        for (;;) {
            var currentCharacter = this.peekChar(peekPos++);
            if (currentCharacter === '\n' || (this.index + peekPos >= this.content.length)) {
                return null;
            }
            buffer += currentCharacter;
            if ((currentCharacter === delimiter && numberOfBackslashes == 0)) {
                var result = new Token(buffer, this.index);
                this.skipChars(buffer.toString().length - 1);
                return result;
            }
            numberOfBackslashes = currentCharacter === '\\' ? (numberOfBackslashes + 1) % 2
                : 0;
        }
    }
    scanWord(startingCharacter) {
        var currentChar = startingCharacter;
        var buffer = '';
        ;
        buffer += currentChar;
        var peekPos = 1;
        for (;;) {
            currentChar = this.peekChar(peekPos++);
            if (!this.isIdentifierCharacter(currentChar)) {
                break;
            }
            buffer += currentChar;
        }
        var result = new Token(buffer.toString(), this.index);
        this.skipChars(buffer.toString().length - 1);
        return result;
    }
    /**
     * Try to parse a XML document
     *
     * @return
     */
    scanXML() {
        var currentIndex = this.index;
        var level = 0;
        var buffer = '';
        ;
        var currentCharacter = '<';
        for (;;) {
            var currentToken = null;
            do {
                currentToken = this.scanUntilDelimiter('<', '>');
                if (currentToken == null) {
                    this.index = currentIndex;
                    return null;
                }
                buffer += currentToken.text;
                if (this.isProcessingInstruction(currentToken.text)) {
                    currentCharacter = this.nextChar();
                    if (currentCharacter === '\n') {
                        buffer += '\n';
                        this.skipChar();
                    }
                    currentToken = null;
                }
            } while (currentToken == null);
            if (currentToken.text.indexOf('</') === 0) {
                level--;
            }
            else if (!endsWith(currentToken.text, '/>')
                && currentToken.text !== '<>') {
                level++;
            }
            if (level <= 0) {
                return new Token(buffer.toString(), currentIndex, false, true);
            }
            for (;;) {
                currentCharacter = this.nextChar();
                if (currentCharacter === '<' || this.index >= this.content.length) {
                    break;
                }
                buffer += currentCharacter;
            }
        }
    }
    /**
     * Something started with a lower sign <
     *
     * @param startingCharacterc
     * @return
     */
    scanXMLOrOperator(startingCharacterc) {
        var xmlToken = this.scanXML();
        if (xmlToken != null && verifyXML(xmlToken.text)) {
            return xmlToken;
        }
        return this.scanCharacterSequence(startingCharacterc, ['<<<=', '<<<', '<<=', '<<', '<=']);
    }
    skipChar() {
        this.nextChar();
    }
    skipChars(count) {
        var decrementCount = count;
        while (decrementCount-- > 0) {
            this.nextChar();
        }
    }
}
module.exports = AS3Scanner;
