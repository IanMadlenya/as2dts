"use strict";
class Node {
    constructor(content, kind, _start, _end, text, children, parent) {
        this.kind = kind;
        this._start = _start;
        this._end = _end;
        this.text = text;
        this.children = children;
        this.parent = parent;
        this.content = function () { return content; };
        if (!this.children)
            this.children = [];
        this.updateSubstr();
    }
    updateSubstr() {
        if (this.end >= this.start) {
            this.substr = this.content().substr(this.start, this.end - this.start);
        }
        else {
            this.substr = "BAD: " + this.content().substr(this.end, this.start - this.end);
        }
    }
    get end() { return this._end; }
    set end(e) { this._end = e; this.updateSubstr(); }
    get start() { return this._start; }
    set start(s) { this._start = s; this.updateSubstr(); }
    findChild(type, text) {
        for (var i = 0; i < this.children.length; i++) {
            if (this.children[i].kind === type && (!text || this.children[i].text === text)) {
                return this.children[i];
            }
        }
        return null;
    }
    findChildren(type) {
        return this.children.filter(child => child.kind === type);
    }
    getChildrenStartingFrom(type) {
        var child = this.findChild(type);
        if (!child) {
            return this.children.slice(0);
        }
        else {
            var index = this.children.indexOf(child);
            return this.children.slice(index + 1);
        }
    }
    getChildrenUntil(type) {
        var child = this.findChild(type);
        if (!child) {
            return this.children.splice(0);
        }
        else {
            var index = this.children.indexOf(child);
            return this.children.slice(0, index);
        }
    }
    get lastChild() {
        var child = null;
        var i = this.children.length;
        while (i-- && !child)
            child = this.children[i];
        return child;
    }
    get subtreeEnd() {
        var child = this.lastChild;
        if (child)
            return Math.max(this.end, child.subtreeEnd);
        return this.end;
    }
    findParent(type) {
        if (!this.parent || this.parent.kind === type)
            return this.parent;
        return this.parent.findParent(type);
    }
    findDescendant(matcher) {
        for (var i = 0; i < this.children.length; i++) {
            var child = this.children[i];
            if (child && matcher(child))
                return child;
            child = child.findDescendant(matcher);
            if (child)
                return child;
        }
        return null;
    }
}
module.exports = Node;
