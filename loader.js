/*
使い方
	Loader.load("game.jsx");

game.jsxの中では、行頭から
"REQUIRE util.jsx"
のように記述しておくと依存先として認識される (先に読み込まれる)

Babelが必要です。
*/

let Loader = {};

Loader.items = {};
Loader.waitCount = 0;
Loader.loadCount = 0;

Loader.load = function(name){
	this.getItem(name);
}

Loader.getItem = function(name){
	if( ! this.items[name]){
		this.waitCount += 1;
		this.items[name] = new LoaderItem(name);
	}
	return this.items[name];
};

Loader.addLoad = function(){
	this.loadCount += 1;
}
Loader.removeLoad = function(){
	this.loadCount -= 1;
	if(this.loadCount == 0 && this.waitCount > 0){
		let waiterNames = [];
		for(let name in this.items) if(this.items[name].isWaiting) waiterNames.push(name);
		throw new Error("Loader: (" + waiterNames.join(", ") + ") Loop Found");
	}
}
Loader.removeWait = function(){
	this.waitCount -= 1;	
};

/*
1=開始 → 2=フェッチ中 → 3=パース中 → 4=依存先適用待ち → 5=適用済み
ファイル名を設定してload()するとフェッチ中になる
フェッチが終わったらthenによりパース中になる
（パース中というステータスは循環参照などの場合に見られることがある）
パースが終わったら依存先適用待ちになる
（依存先が無いか適用済みだった場合は直ちに適用して適用済みになる）
依存先が適用済みになったとき呼ばれて待ちの数を減らす
待ちの数が無くなったら自分も適用して適用済みになる
*/

let LoaderItem = function(name){
	this.name = "" + name;
	this.callers = [];
	this.callees = [];
	this.waitCount = 0;
	this.source = "";
	this.isLoading = false;
	this.isLoaded = false;
	this.isWaiting = false;
	this.isDone = false;

	this.load();
}

LoaderItem.prototype.load = async function(){
	if(this.isLoading) throw new Error("Loader: (" + this.name + ") Already Loading");
	if(this.isLoaded) throw new Error("Loader: (" + this.name + ") Already Loaded");
	this.isLoading = true;
	Loader.addLoad();
	console.log("Loader: loading " + this.name);
	fetch(this.name)
		.then((response) => {
			if(response.ok) return response.text();
			else throw new Error("Loader: (" + this.name + ") " + response.statusText);
			})
		.then((text) => {
			this.isLoading = false;
			this.isLoaded = true;
			this.parse(text);
			if(this.waitCount == 0) this.perform();
			else this.isWaiting = true;
			Loader.removeLoad();
		});
}

LoaderItem.prototype.parse = function(text){
	let lines = text.split(/\r?\n/);
	for(let line of lines){
		let match = line.match(/^"REQUIRE (.*)";?$/);
		if(match && match[1]){
			let calleeName = match[1];
			let callee = Loader.getItem(calleeName);
			this.addCallee(callee);
		}
	}
	this.source = text;
}

LoaderItem.prototype.addCallee = function(callee){
	if(this.isWaiting) throw new Error("Loader: (" + this.name + ") Caller Already Waiting");
	if(this.callees.includes(callee)) return;
	if(callee.isDone) return;
	this.callees.push(callee);
	this.waitCount += 1;
	callee.callers.push(this);
}

LoaderItem.prototype.perform = function(){
	if( ! this.isLoaded) throw new Error("Loader: (" + this.name + ") Caller Not Yet Loaded");
	if(this.isWaiting) throw new Error("Loader: (" + this.name + ") Caller Still Waiting");

	let transformed = Babel.transform(this.source, { 
		"presets": [["react", { "runtime": "classic" }]] 
	}).code;
	let script = document.createElement("script");
	script.type = "text/javascript";
	script.innerHTML = transformed;
	document.head.appendChild(script);

	console.log("Loader: done " + this.name);
	this.isDone = true;
	for(let caller of this.callers) caller.removeWait();
	Loader.removeWait();
}

LoaderItem.prototype.removeWait = function(){
	this.waitCount -= 1;
	console.log("Loader: " + this.name + " : waiting for " + this.waitCount);
	if(this.waitCount == 0){
		this.isWaiting = false;
		this.perform();
	}
}
