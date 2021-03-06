const wordlist = require('../lang/english.js');
const Player = require('./player.js');


//TODO: 
//handle game state if active  player disconnects
//send current drawing to new player
//ensure words chosen are unique
//

//check if value is between bounds (inclusive)
function inBounds(x, lowBound, highBound) {
	return x >= lowBound && x <= highBound;
}

const STATE = {
	LOBBY: 0,
	CHOICE: 1,
	DRAW: 2,
	END: 3,
	GAMEEND: 4,
}

const COLOR = {
	GREEN: '#7DAD3F',
	LIME: '#56CE27',
	ORANGE: '#CE4F0A',
	BLUE: '#3975CE',
}

class Room{
	constructor(id,io){
		this.id = id;
		this.io = io;
		//game loop: lobby -> choice -> draw -> end
		this.players = [];
		this.playerCount = 0;
		this.roundLimit = 3;
		this.resetState();
		this.memory = []
	}

	getPlayer(id) {
		return this.players.filter(x=>x.id===id).pop()
	}

	resetState(){
		this.currentPlayer = null;
		this.currentPlayerName = '';
		this.word = "";
		this.maskedWord = "";
		this.lowerCaseWord = "";
		this.choices = ['','',''];
		this.round = 0;
		this.image = "";
		this.startTime = Date.now();
		this.endTime = null;
		this.drawTime = 80;//80 seconds
		this.choiceTime = 15;
		this.memory = []
		clearTimeout(this.timer);
		this.timer = null;
		this.votes = 0;

		for(let player of this.players){
			player.participated = false;
			player.score = 0;
			player.scoreDelta = 0;
		}
	}

	updateStatus(){
		if(this.state !== STATE.LOBBY && this.playerCount < 2){
			//stop game
			this.resetState();
			this.state = STATE.LOBBY;
		}else if(this.state === STATE.LOBBY && this.playerCount > 1){
			//start game
			console.log("starting");
			this.round = 0;
			this.timer = setTimeout(()=>{this.newRound()}, 300);
		}else if(
			this.state === STATE.DRAW &&
			this.players.filter(x=>x.scoreDelta).length == this.playerCount - 1
		) {
			clearTimeout(this.timer);
			this.end('Everybody guessed the word!');
		}
	}

	newRound(){
		this.round += 1;

		if(this.round > this.roundLimit) {
			console.log("game ended",this.round)
			this.state = STATE.GAMEEND
			this.round = 0;
			this.io.to(this.id).emit('gameEnd');
			this.resetState();
			clearTimeout(this.timer);
			setTimeout(()=>{this.newRound()}, 10000);
			return;
		}

		console.log("Round: ", this.round);
		for(let player of this.players){
			player.participated = false;
		}
		this.io.to(this.id).emit("round", this.round);

		this.timer = setTimeout(()=>{this.sendChoices()}, 2500);
	}

	
	//on player connect to room
	addPlayer(data, socket){
		if(this.players.length >= 10){
			return -1;
		}

		let properties = Player.validate(data);
		if(properties === false){
			return -1;
		}
		if(properties[0] === '') {
			properties[0] = wordlist.sample();
		}
		let player = new Player(socket.id, ...properties);
		this.players.push(player);
		this.playerCount = this.players.length
		this.updateStatus()

		socket.emit('connected');
		socket.emit('roominfo', {players: this.players.map(x=>x.publicInfo()), round: this.round});
		if(this.state === STATE.CHOICE){
			socket.emit('choosing', this.currentPlayerName);
		}else if(this.state === STATE.DRAW){
			socket.emit('secret', {
				word: this.maskedWord,
				drawing: this.currentPlayer
			});
			this.io.to(player.id).emit('timer', {time: this.countDown, end:this.endTime});
			if(this.memory.length) {
				this.redraw(socket.id, 0);
			}
		}
		socket.join(this.id);
		socket.to(this.id).emit('playerjoined', player.publicInfo());
		this.io.to(this.id).emit('message', {content: `${properties[0]} joined.`, color: COLOR.LIME});

		return this.playerCount - 1
	}

	redraw(player, index) {
		if(
			this.state === STATE.DRAW &&
			this.memory.length &&
			index < this.memory.length
		) {
			let next = this.memory[index];
			this.io.to(player).emit(next.length==3?'fill':'draw',next);
			setTimeout(()=>{this.redraw(player, index+1)}, 5);
		}
	}

	kick(socket) {
		if(socket.id === player.id) {
			return -1;
		}
		this.votes += 1;
	}

	//on player leave to room
	removePlayer(socket) {
		for(let i=0; i < this.players.length; i++){
			if(this.players[i].id == socket.id){
				let name = this.players[i].name
				if(this.players[i].id == this.currentPlayer) {
					this.end('Player disconnected!');
				}
				this.players.splice(i,1);
				this.playerCount = this.players.length;
				this.updateStatus()

				socket.to(this.id).emit('playerleft', socket.id);
				socket.to(this.id).emit('message', {content: `${name} left.`, color: COLOR.ORANGE});
				return i;
			}
		}
		return -1;
	}

	//game timer
	start(){
		console.log("triggered: start()");
		this.state = STATE.DRAW;
		let secret = {
			word: this.maskedWord,
			drawing: this.currentPlayer
		}
		for(let x of this.players){
			if(x.id!=this.currentPlayer){
				this.io.to(this.id).emit('secret', secret);
			}
		}
		secret.word = this.word;
		this.io.to(this.currentPlayer).emit('secret', secret);
		this.io.to(this.id).emit('message', {
			content: `${this.currentPlayerName} is now drawing!`,
			color: COLOR.BLUE
		});
		//count down 60 seconds
		this.startTime = Date.now();
		this.endTime = this.startTime + this.drawTime * 1000;
		this.countDown = this.drawTime;
		this.io.to(this.id).emit('timer', {time: this.countDown, end:this.endTime});
		this.timer = setTimeout(()=>{this.end("Time is up!")}, this.drawTime * 1000);
	}

	end(reason){
		console.log("triggered: end()");
		console.log(reason, Date.now()-this.startTime)
		this.io.to(this.id).emit('clear',true);
		clearTimeout(this.timer)
		this.timer = null;

		//display end screen;
		//return to choice
		this.state = STATE.END;
		//send results in descending order
		let deltas = [];
		let scores = 0;
		let count = 0;
		for(let i = 0; i < this.players.length; i++) {
			if(this.players[i].id != this.currentPlayer) {
				deltas.push({
					name: this.players[i].name,
					change: this.players[i].scoreDelta,
				});
				if(this.players[i].scoreDelta > 0) {
					scores += this.players[i].scoreDelta;
					count++;
				}
			}
		}
		let drawer = this.currentPlayerName;
		//calculate drawer score = sum(changes) / correct guesses + 1
		let drawerScore = Math.floor(scores/(count+1));  
		deltas.push({name: drawer, change: drawerScore});
		deltas.sort((x,y)=>y.change-x.change)
		
		//update drawer score
		let player = this.getPlayer(this.currentPlayer);
		player.score+=drawerScore;
		this.io.to(this.id).emit('update', {
			id: this.currentPlayer,
			score: player.score,
		});

		this.io.to(this.id).emit('end', {
			reason: reason,
			scores: deltas,
			word: this.word
		});
		//wait 5 seconds and then continue game loop
		setTimeout(()=>{this.sendChoices()}, 5000);

		for(let player of this.players){
			player.scoreDelta = 0;
		}
	}

	draw(data, socket) {
		if(
			socket.id !== this.currentPlayer ||
			!Array.isArray(data) ||
			data.length != 5 ||
			!data.every(Number.isInteger) ||
			!inBounds(data[0], 0, 800) ||
			!inBounds(data[1], 0, 600) ||
			!inBounds(data[2], 0, 800) ||
			!inBounds(data[3], 0, 600) ||
			!inBounds(data[4], 0, 91)  //(22<<2)+ 4 (right most 2 bits for width)
		) {
			console.log(data)
			return -1
		}
		this.memory.push(data);
		socket.to(this.id).emit('draw', data);
	}

	fill(data, socket) {
		if(
			socket.id !== this.currentPlayer ||
			!Array.isArray(data) ||
			data.length != 3 ||
			!data.every(Number.isInteger) ||
			!inBounds(data[0], 0, 800) || 
			!inBounds(data[1], 0, 600) ||
			!inBounds(data[2], 0, 22)
		) {
		  return -1;
		}
		this.memory.push(data);
		socket.to(this.id).emit('fill',data);
	}

	clear(socket) {
		if(socket.id !== this.currentPlayer) {
		  return -1;
		}
		this.memory = [];
		socket.to(this.id).emit('clear', false);
	}

	sendChoices(){
		console.log("triggered: sendChoices()");
		if(this.playerCount < 2){
			//prevent game from playing when no one is on
			return
		}
		//select player first
		let player = null;
		for(let p of this.players){
			if(!p.participated){
				p.participated = true;
				player = p;
				break
			}
		}
		if(player == null) {
			console.log("All players have particpated, starting new round");
			this.newRound();
			return;
		}else {
			this.state = STATE.CHOICE;
			//select three words
			for(let i = 0; i < 3; i++) {
				this.choices[i] = wordlist.sample();
			}

			this.currentPlayer = player.id;
			this.currentPlayerName = player.name;
			
			for(let p of this.players) {
				if(p.id != player.id) {
					this.io.to(p.id).emit('choosing', player.name);
					console.log(p.id)
				}
			}
			this.io.to(player.id).emit('choice', this.choices);
		}
		this.startTime = Date.now()
		this.endTime = this.startTime + this.choiceTime * 1000;
		this.countDown = this.choiceTime
		this.io.to(this.id).emit('timer', {time: this.countDown, end:this.endTime});
		this.timer = setTimeout(()=>{
			if(this.state === STATE.CHOICE) {
				this.setWord(this.choices.sample());
			}

		}, 15000);
	}

	setWord(word){
		this.word = word;
		this.maskedWord = this.word.replace(/\S/g, '_');
		this.lowerCaseWord = this.word.toLowerCase();
		this.choices = ['','',''];
		this.start();
	}

	selectChoice(choice, socket) {
		if(!Number.isInteger(choice) || !inBounds(choice, 0, 2)) {
		  return -1;
		}
		clearTimeout(this.timer);

		let player = this.getPlayer(socket.id);
		if(this.state !== STATE.CHOICE || socket.id !== this.currentPlayer) {
		  return -1;
		}
		this.setWord(this.choices[choice]);
	}

	message(data, socket) {
		if(typeof(data) !== 'string' || data.length > 100) {
			return -1;
		}
		let player = this.getPlayer(socket.id);

		if(this.state === STATE.DRAW) {
			//if player is the drawer or has guessed correctly 
			if(player.id === this.currentPlayer || player.scoreDelta) {
				const message = {
					name: player.name,
					content: data,
					color: COLOR.GREEN
				};
				for(let player of this.players.filter(x=>x.scoreDelta || x.id === this.currentPlayer)) {
					this.io.to(player.id).emit('message', message);
				}
				return 0;
			}

			//check simularity
			let guess = data.trim().toLowerCase();
			let count = 0;
			for(let i = 0; i < this.lowerCaseWord.length; i++) { 
				if (guess[i] === this.lowerCaseWord[i]) {
					count++;
				}
			}
			//check word length
			if(guess.length > this.lowerCaseWord.length) {
				count -= (guess.length - this.lowerCaseWord.length);
			}

			if(count === this.lowerCaseWord.length) {
				//Player guessed the right word!
				const guessTime = this.drawTime - (Date.now() - this.startTime) / 1000;
				player.scoreDelta = Math.floor(guessTime/2)*10+200;
				player.score += player.scoreDelta;

				this.io.to(this.id).emit('message', {
					content: `${player.name} guessed the word!`,
					color: COLOR.LIME
				});

				socket.emit('secret', {
					word: this.word
				});

				this.io.to(this.id).emit('update', {
					id: player.id,
					score: player.score
				});

				//check all players have scored
				if(this.players.filter(x=>x.scoreDelta).length === this.playerCount - 1) {
					this.end('Everybody guessed the word!');
				}
				return 0;
			} else if(Math.abs(count-this.lowerCaseWord.length) === 1){
				socket.emit('message', {
					content: `${data} is close!`,
					color: COLOR.GREEN
				});
				return 0;
			}
		}
			//emit generic chat message
		this.io.to(this.id).emit('message', {name: player.name, content: data});
	}
}

module.exports = Room;
