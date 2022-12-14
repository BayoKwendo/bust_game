/**
* The code that renders the canvas, its life cycle is managed by Chart.js
*/
define([
  "stores/GameSettingsStore",
  "game-logic/clib",
  "game-logic/stateLib",
  "lodash",
  "game-logic/engine",
], function (GameSettingsStore, Clib, StateLib, _, Engine) {
  function Graph() {
    this.rendering = false;
    this.animRequest = null;
    this.getParentNodeFunc = null;

    this.onWindowResizeBinded = this.onWindowResize.bind(this);
    this.onChangeBinded = this.onChange.bind(this);
  }

  Graph.prototype.startRendering = function (canvasNode, getParentNodeFunc) {
    this.rendering = true;
    this.getParentNodeFunc = getParentNodeFunc;

    if (!canvasNode.getContext) return console.error("No canvas");

    this.ctx = canvasNode.getContext("2d");

    this.ctx2 = canvasNode.getContext("3d");

    var parentNode = this.getParentNodeFunc();
    this.canvasWidth = parentNode.clientWidth;
    this.canvasHeight = parentNode.clientHeight;
    this.canvas = canvasNode;
    this.theme = GameSettingsStore.getCurrentTheme();
    this.configPlotSettings();

    this.animRequest = window.requestAnimationFrame(this.render.bind(this));

    GameSettingsStore.on("all", this.onChangeBinded);
    window.addEventListener("resize", this.onWindowResizeBinded);
  };

  Graph.prototype.stopRendering = function () {
    this.rendering = false;

    GameSettingsStore.off("all", this.onChangeBinded);
    window.removeEventListener("resize", this.onWindowResizeBinded);
  };

  Graph.prototype.onChange = function () {
    this.theme = GameSettingsStore.getCurrentTheme();
    this.configPlotSettings();
  };

  Graph.prototype.render = function () {
    if (!this.rendering) return;

    this.calcGameData();
    this.calculatePlotValues();
    this.clean();
    this.drawGraph();
    this.drawAxes();
    this.drawGameData();
    this.animRequest = window.requestAnimationFrame(this.render.bind(this));
  };

  /** On windows resize adjust the canvas size to the canvas parent size */
  Graph.prototype.onWindowResize = function () {
    var parentNode = this.getParentNodeFunc();
    this.canvasWidth = parentNode.clientWidth;
    this.canvasHeight = parentNode.clientHeight;
    this.configPlotSettings();
  };

  Graph.prototype.configPlotSettings = function () {
    this.canvas.width = this.canvasWidth;
    this.canvas.height = this.canvasHeight;
    this.themeWhite = this.theme === "white";
    this.plotWidth = this.canvasWidth - 30;
    this.plotHeight = this.canvasHeight - 20; //280
    this.xStart = this.canvasWidth - this.plotWidth;
    this.yStart = this.canvasHeight - this.plotHeight;
    this.XAxisPlotMinValue = 10000; //10 Seconds
    this.YAxisSizeMultiplier = 2; //YAxis is x times
    this.YAxisInitialPlotValue = "zero"; //"zero", "betSize" //TODO: ???
  };

  Graph.prototype.calcGameData = function () {
    //TODO: Use getGamePayout from engine.
    this.currentTime = Clib.getElapsedTimeWithLag(Engine);
    this.currentGamePayout = Clib.calcGamePayout(this.currentTime);
  };

  Graph.prototype.calculatePlotValues = function () {
    //Plot variables
    this.YAxisPlotMinValue = this.YAxisSizeMultiplier;
    this.YAxisPlotValue = this.YAxisPlotMinValue;

    this.XAxisPlotValue = this.XAxisPlotMinValue;

    //Adjust X Plot's Axis
    if (this.currentTime > this.XAxisPlotMinValue)
      this.XAxisPlotValue = this.currentTime;

    //Adjust Y Plot's Axis
    if (this.currentGamePayout > this.YAxisPlotMinValue)
      this.YAxisPlotValue = this.currentGamePayout;

    //We start counting from cero to plot
    this.YAxisPlotValue -= 1;

    //Graph values
    this.widthIncrement = (this.plotWidth) / this.XAxisPlotValue;

    this.heightIncrement = this.plotHeight / this.YAxisPlotValue;
    this.currentX = this.currentTime * this.widthIncrement;
  };

  Graph.prototype.clean = function () {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  };

  Graph.prototype.drawGraph = function () {
    /* Style the line depending on the game states */
    this.ctx.strokeStyle = this.themeWhite ? "Black" : "orange";

    //Playing and not cashed out
    if (StateLib.currentlyPlaying(Engine)) {
      this.ctx.lineWidth = 4;
      this.ctx.strokeStyle = "#7cba00";
      //Cashing out
    } else if (Engine.cashingOut) {
      this.ctx.lineWidth = 4;
      this.ctx.strokeStyle = "Grey";
    } else {
      this.ctx.lineWidth = 4;
    }

    this.ctx.beginPath();
    Clib.seed(1);

    /* Draw the graph */
    for (var t = 0, i = 0; t <= this.currentTime; t += 100, i++) {
      /* Graph */
      var payout = Clib.calcGamePayout(t) - 1; //We start counting from one x

      var y = this.plotHeight - payout * (this.heightIncrement + 10);
      var x = t * this.widthIncrement;
      this.ctx.lineTo(x + this.xStart, y);

      /* Avoid crashing the explorer if the cycle is infinite */
      if (i > 5000) {
        console.log("For 1 too long!");
        break;
      }
    }
    this.ctx.stroke();
  };

  Graph.prototype.drawAxes = function () {
    //Function to calculate the plotting values of the Axes
    function stepValues(x) {
      console.assert(_.isFinite(x));
      var c = 0.4;
      var r = 0.1;
      while (true) {
        if (x < c) return r;

        c *= 5;
        r *= 2;

        if (x < c) return r;
        c *= 2;
        r *= 5;
      }
    }

    //Calculate Y Axis
    this.YAxisPlotMaxValue = this.YAxisPlotMinValue;
    this.payoutSeparation = stepValues(
      !this.currentGamePayout ? 1 : this.currentGamePayout
    );

    this.ctx.lineWidth = 1;
    this.ctx.strokeStyle = this.themeWhite ? "Black" : "#b0b3c1";
    this.ctx.font = "10px Courier New";
    this.ctx.fillStyle = this.themeWhite ? "black" : "#b0b3c1";
    this.ctx.textAlign = "center";

    //Draw Y Axis Values
    var heightIncrement = this.plotHeight / this.YAxisPlotValue;
    for (
      var payout = this.payoutSeparation, i = 0;
      payout < this.YAxisPlotValue;
      payout += this.payoutSeparation, i++
    ) {
      var y = this.plotHeight - payout * heightIncrement;
      this.ctx.font = "10px bold";

      this.ctx.fillStyle = "#ffffff";
      this.ctx.fillText(payout + 1 + "x", 10, y);
      this.ctx.beginPath();

      this.ctx.moveTo(this.xStart, y);

      this.ctx.lineTo(this.xStart + 5, y);

      this.ctx.stroke();

      if (i > 100) {
        console.log("For 3 too long");
        break;
      }

    }

    //Calculate X Axis
    this.milisecondsSeparation = stepValues(this.XAxisPlotValue);
    this.XAxisValuesSeparation =
      this.plotWidth / (this.XAxisPlotValue / this.milisecondsSeparation);

    //Draw X Axis Values
    for (
      var miliseconds = 0, counter = 0, i = 0;
      miliseconds < this.XAxisPlotValue;
      miliseconds += this.milisecondsSeparation, counter++, i++
    ) {
      var seconds = miliseconds / 1000;
      var textWidth = this.ctx.measureText(seconds).width;
      var x = counter * this.XAxisValuesSeparation + this.xStart;
      this.ctx.fillText(seconds, x - textWidth / 2, this.plotHeight + 11);

      if (i > 100) {
        console.log("For 4 too long");
        break;
      }
    }

    //Draw background Axis
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(this.xStart, 0);
    this.ctx.lineTo(this.xStart, this.canvasHeight - this.yStart);
    this.ctx.lineTo(this.canvasWidth, this.canvasHeight - this.yStart);
    this.ctx.stroke();
  };

  Graph.prototype.drawGameData = function () {
    //One percent of canvas width
    var onePercent = this.canvasWidth / 100;
    //Multiply it x times
    function fontSizeNum(times) {
      return onePercent * times;
    }
    //Return the font size in pixels of one percent of the width canvas by x times
    function fontSizePx(times) {
      var fontSize = fontSizeNum(times);
      return fontSize.toFixed(2) + "px";
    }

    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";

    if (Engine.gameState === "IN_PROGRESS") {
      if (StateLib.currentlyPlaying(Engine)) this.ctx.fillStyle = "#7cba00";
      else this.ctx.fillStyle = this.themeWhite ? "black" : "#b0b3c1";

      if (this.ctx.canvas.width < 480) {

        this.ctx.font = "40px bold";
      }
      else if (this.ctx.canvas.width > 480 && this.ctx.canvas.width < 720) {


        this.ctx.font = "50px bold";
      }
      else {
        this.ctx.font = "50px bold";
      }



      //   console.log(this.currentGamePayout)
      this.ctx.fillText(
        parseFloat(this.currentGamePayout).toFixed(2) + "x",
        this.canvasWidth / 2,
        this.canvasHeight / 2
      );
    }

    //If the engine enters in the room @ ENDED it doesn't have the crash value, so we don't display it
    if (Engine.gameState === "ENDED") {
      var image = new Image(200, 200);


      this.ctx.font = fontSizePx(9) + " Courier New";
      this.ctx.fillStyle = "red";
      this.ctx.fillText(
        "Busted",
        this.canvasWidth / 2,
        this.canvasHeight / 2 - fontSizeNum(12) / 2
      );
      this.ctx.fillText(
        "@ " + Clib.formatDecimals(Engine.tableHistory[0].game_crash, 2) + "x",
        this.canvasWidth / 2,
        this.canvasHeight / 2 + fontSizeNum(12) / 2
      );
    }

    if (Engine.gameState === "STARTING") {



      if (this.ctx.canvas.width < 480) {
        this.ctx.font = "20px bold";
      }
      else if (this.ctx.canvas.width > 480 && this.ctx.canvas.width < 720) {
        this.ctx.font = "30px bold";
      }
      else {
        this.ctx.font = "50px bold";
      }


      this.ctx.fillStyle = "#ffffff";


      this.ctx.fillText(
        "Preparing Round",
        this.canvasWidth / 2,
        this.canvasHeight / 2.3
      );


      if (this.ctx.canvas.width < 480) {
        this.ctx.font = "15px bold";
      }
      else if (this.ctx.canvas.width > 480 && this.ctx.canvas.width < 720) {
        this.ctx.font = "15px bold";
      }
      else {
        this.ctx.font = "20px bold";
      }

      this.ctx.fillStyle = "#dd641d";
      var timeLeft = ((Engine.startTime - Date.now()) / 1000).toFixed(1);


      this.ctx.fillText(
        "Starts in " + timeLeft + "sec \n\n",
        this.canvasWidth / 2,
        this.canvasHeight / 2 + fontSizeNum(5) / 2
      );



    }

    if (this.lag) {
      this.ctx.fillStyle = "black";
      this.ctx.font = "20px Courier New";
      this.ctx.fillText("Network Lag", 250, 250);
    }

    if (Engine.cashingOut) {
      // console.log("stopped_specific", Engine.)
      var image = new Image(20, 20);
      image.src = "https://cdn-icons-png.flaticon.com/128/3254/3254227.png";

      if (this.ctx.canvas.width < 400) {
        image.onload = this.ctx.drawImage(image, 100, 2);
      }

      else if (this.ctx.canvas.width > 400 && this.ctx.canvas.width < 500) {
        image.onload = this.ctx.drawImage(image, 150, 2);
      }
      else if (this.ctx.canvas.width > 500 && this.ctx.canvas.width < 600) {
        image.onload = this.ctx.drawImage(image, 200, 2);

      }

      else {
        image.onload = this.ctx.drawImage(image, 350, 40);

      }



      if (this.ctx.canvas.width < 480) {
        this.ctx.font = "900 30px bold";
      }
      else if (this.ctx.canvas.width > 480 && this.ctx.canvas.width < 720) {
        this.ctx.font = "900 30px bold";
      }
      else {
        this.ctx.font = "900 50px bold";
      }

      // this.ctx.font = "900 40px Arial";
      this.ctx.fillStyle = "darkgreen";
      // this.ctx.font = "Bold";
      this.ctx.fillText(
        "CashOut",
        this.canvasWidth / 2,
        this.canvasHeight / 2 - fontSizeNum(10) / 2
      );
      // this.ctx.fillText(
      //   "multiplier",
      //   this.canvasWidth / 2,
      //   this.canvasHeight / 2 + fontSizeNum(10) / 2
      // );
      this.ctx.fillText(
        "@ " + Clib.formatDecimals(Engine.stopped_specific, 2) + "x",
        this.canvasWidth / 2,
        this.canvasHeight / 2 + fontSizeNum(30) / 2
      );
    }
  };

  return Graph;
});
