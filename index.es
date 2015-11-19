var antlr4 = require('antlr4');
var fhirpath = require('./fhirpath');
var util = require('util');
var coerce = {
    boolean: function(v){
        console.log("coercing", v)
        if (v === false) return false;
        if (util.isArray(v))
            return coerce.boolean(v[0]);
        return true;
    }
}

var applyToEach = (fn) => (coll, ...rest) => {
    return coll.flatMap(item =>fn.apply(null, [item].concat(rest)))
}

var resolveArguments = (fn) => (coll, ...rest) => {
    return fn.apply(null, [coll].concat(rest.map(i => execute(coll, i))))
}

var functionBank = {
    "$path": applyToEach((item, segment, recurse)=>{
        if (item.resourceType && item.resourceType === segment){
            return item
        }
        var segments = [segment]
        var choice = segment.match(/\[x\]$/)
        if (choice){
            segments = Object.keys(item).filter(k=>k.match(RegExp("^"+choice[1])))
        }
        return segments.flatMap(s=>item[s])
    }),
    "$where": applyToEach((item, conditions) => {
        var keep = execute([item], conditions)
        console.log("keep", keep, coerce.boolean(keep))
        return coerce.boolean(keep) ? item : [];
    }),
    "$constant": (_, val)=>{
        return val
    },
    "$first": (coll)=> coll.slice(0,1),
    "$last": (coll)=> coll.slice(-1),
    "$tail": (coll)=> coll.slice(1),
    "$item": resolveArguments((coll, i) => coll.slice(i,i+1)),
    "$skip": resolveArguments((coll, i) => coll.slice(i)),
    "$take": resolveArguments((coll, i) => coll.slice(0,i))
}

var whenSingle = (fn)=>{
    (lhs, rhs) => {
        if (lhs.length !== 1 || rhs.length !== 1) return [];
        return fn(lhs[0], rhs[0]);
    }
}

var operatorBank = {
    "=": (lhs, rhs) => {
        return lhs.filter(item=>{return item === rhs[0];})
    },
    "|": (lhs, rhs) => lhs.concat(rhs),
    "+": whenSingle((lhs, rhs)=>{
        if (typeof lhs !== typeof rhs) return [];
        return lhs[0] + rhs[0];
    })
}

Array.prototype.flatMap = function(lambda) {
    return Array.prototype.concat.apply([], this.map(lambda));
}

//ex = process.argv[2];

function execute(coll, tree){

    if (!util.isArray(tree[0])){
        return execute(coll, [tree]);
    }

    return tree.reduce((coll, cur)=>{
        var fnName = cur[0];
        var fn = functionBank[fnName];
        if (fn)
            return fn.apply(null, [coll].concat(cur.slice(1)))

        var op = operatorBank[fnName];
        if (op){
            console.log("call pop", coll, cur[1])
            var lhs = execute(coll, cur[1]);
            var rhs = execute(coll, cur[2]);
            var ret = op(lhs, rhs);
            console.log("op returnied", ret);
            return ret;
        }
    }, coll);

}

module.exports = (resource, path) => {
    var tree = fhirpath.parse(path);
    var result = execute([resource], tree);
    return [tree, result];
}
