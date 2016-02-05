
class Node {
	public content:Function;
	public substr:string;
	
    constructor (
		content: string,
        public kind: string, 
        public _start: number,
        public _end: number,
        public text?: string,
        public children?: Node[],
        public parent? :Node
    ) {
		this.content = function(){ return content; };
        if (!this.children) {
            this.children = []
        }
		this.updateSubstr();
    }
	
	updateSubstr():void {
		if (this.end >= this.start)
		{
			this.substr = this.content().substr(this.start, this.end - this.start);
		}
		else
		{
			this.substr = "BAD: " + this.content().substr(this.end, this.start - this.end);
		}
	}
	
	get end():number { return this._end; }
	set end(e:number) { this._end = e; this.updateSubstr(); }
	get start():number { return this._start; }
	set start(s:number) { this._start = s; this.updateSubstr(); }
    
    findChild(type: string): Node {
        for (var i = 0; i< this.children.length;i++) {
            if (this.children[i].kind === type) {
                return this.children[i]
            }
        }
        return null;
    }
    
    findChildren(type: string): Node[] {
        return this.children.filter(child => child.kind === type);
    }
    
    getChildrenStartingFrom(type: string): Node[] {
        var child = this.findChild(type);
        if (!child) {
            return this.children.slice(0)
        } else {
            var index = this.children.indexOf(child);
            return this.children.slice(index + 1);
        }
    }
    
    getChildrenUntil(type: string): Node[] {
        var child = this.findChild(type);
        if (!child) {
            return this.children.splice(0)
        } else {
            var index = this.children.indexOf(child);
            return this.children.slice(0, index);
        }
    }
    
    get lastChild(): Node {
        return this.children[this.children.length -1];
    }
	
	get subtreeEnd(): number {
		var i:number = this.children.length;
		var child:Node = null;
		while (i-- && !child)
			child = this.children[i];
		if (child)
			return Math.max(this.end, child.subtreeEnd);
		return this.end;
	}
}

export = Node;