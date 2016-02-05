var Node = (function () {
    function Node(content, kind, _start, _end, text, children, parent) {
        this.kind = kind;
        this._start = _start;
        this._end = _end;
        this.text = text;
        this.children = children;
        this.parent = parent;
        this.content = function () {
            return content;
        };
        if (!this.children) {
            this.children = [];
        }
        this.updateSubstr();
    }
    Node.prototype.updateSubstr = function () {
        if (this.end >= this.start) {
            this.substr = this.content().substr(this.start, this.end - this.start);
        }
        else {
            this.substr = "BAD: " + this.content().substr(this.end, this.start - this.end);
        }
    };
    Object.defineProperty(Node.prototype, "end", {
        get: function () {
            return this._end;
        },
        set: function (e) {
            this._end = e;
            this.updateSubstr();
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Node.prototype, "start", {
        get: function () {
            return this._start;
        },
        set: function (s) {
            this._start = s;
            this.updateSubstr();
        },
        enumerable: true,
        configurable: true
    });
    Node.prototype.findChild = function (type) {
        for (var i = 0; i < this.children.length; i++) {
            if (this.children[i].kind === type) {
                return this.children[i];
            }
        }
        return null;
    };
    Node.prototype.findChildren = function (type) {
        return this.children.filter(function (child) { return child.kind === type; });
    };
    Node.prototype.getChildrenStartingFrom = function (type) {
        var child = this.findChild(type);
        if (!child) {
            return this.children.slice(0);
        }
        else {
            var index = this.children.indexOf(child);
            return this.children.slice(index + 1);
        }
    };
    Node.prototype.getChildrenUntil = function (type) {
        var child = this.findChild(type);
        if (!child) {
            return this.children.splice(0);
        }
        else {
            var index = this.children.indexOf(child);
            return this.children.slice(0, index);
        }
    };
    Object.defineProperty(Node.prototype, "lastChild", {
        get: function () {
            return this.children[this.children.length - 1];
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Node.prototype, "subtreeEnd", {
        get: function () {
            var i = this.children.length;
            var child = null;
            while (i-- && !child)
                child = this.children[i];
            if (child)
                return Math.max(this.end, child.subtreeEnd);
            return this.end;
        },
        enumerable: true,
        configurable: true
    });
    return Node;
})();
module.exports = Node;
