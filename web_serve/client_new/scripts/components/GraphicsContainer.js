define([
  "react",
  "lodash",
  "game-logic/clib",
  "components/GraphicDisplay",
  "components/TextDisplay",
  "game-logic/engine",
  "stores/ChartStore",
  "stores/ControlsStore",
  "game-logic/stateLib",
  "stores/GameSettingsStore",
], function (
  React,
  _,
  Clib,
  GraphicDisplayClass,
  TextDisplayClass,
  Engine,
  ChartStore,
  ControlsStore,
  StateLib,
  GameSettingsStore
) {
  var D = React.DOM;

  var GraphicDisplay = new GraphicDisplayClass();
  var TextDisplay = React.createFactory(TextDisplayClass);

  function getState() {
    return _.merge(
      {
        betSize: ControlsStore.getBetSize(), //Bet input string in bits
        cashOut: ControlsStore.getCashOut(),
      },
      ChartStore.getState(),
      GameSettingsStore.getState()
    );
  }

  return React.createClass({
    displayName: "Chart",

    propTypes: {
      isMobileOrSmall: React.PropTypes.bool.isRequired,
      controlsSize: React.PropTypes.string.isRequired,
    },

    getInitialState: function () {
      var state = getState();
      state.nyan = false;
      return state;
    },

    getThisElementNode: function () {
      return this.getDOMNode();
    },

    componentDidMount: function () {
      Engine.on({
        game_started: this._onChange,
        game_crash: this._onChange,
        game_starting: this._onChange,
        lag_change: this._onChange,
        nyan_cat_animation: this._onNyanAnim,
      });
      GameSettingsStore.addChangeListener(this._onChange);

      if (this.state.graphMode === "graphics")
        GraphicDisplay.startRendering(
          this.refs.canvas.getDOMNode(),
          this.getThisElementNode
        );
    },

    componentWillUnmount: function () {
      Engine.off({
        game_started: this._onChange,
        game_crash: this._onChange,
        game_starting: this._onChange,
        lag_change: this._onChange,
        nyan_cat_animation: this._onNyanAnim,
      });
      GameSettingsStore.removeChangeListener(this._onChange);

      if (this.state.graphMode === "graphics") GraphicDisplay.stopRendering();
    },

    _onChange: function () {
      if (this.state.nyan === true && Engine.gameState !== "IN_PROGRESS")
        this.setState({ nyan: false });

      var state = getState();

      if (this.state.graphMode !== state.graphMode) {
        if (this.state.graphMode === "text")
          GraphicDisplay.startRendering(
            this.refs.canvas.getDOMNode(),
            this.getThisElementNode
          );
        else GraphicDisplay.stopRendering();
      }

      if (this.isMounted()) this.setState(state);
    },

    componentDidUpdate: function (prevProps, prevState) {
      //Detect changes on the controls size to trigger a window resize to resize the canvas of the graphics display
      if (
        this.state.graphMode === "graphics" &&
        this.state.controlsSize !== prevState.controlsSize
      )
        GraphicDisplay.onWindowResize();
    },

    _onNyanAnim: function () {
      this.setState({ nyan: true });
    },

    render: function () {
      var textDisplay = this.state.graphMode === "text" ? TextDisplay() : null;

      console.log("state", Engine.gameState);

      return D.div(
        {
          id: "chart-inner-container",
          className: this.props.controlsSize,
          ref: "container",
        },
        // D.div({ className: 'anim-cont' },
        //     D.div({ className: 'nyan' + (this.state.nyan? ' show' : '') },
        //         this.state.nyan? D.img({ src: 'img/nyan.gif' }) : null
        //     )
        // ),
        D.div(
          { className: "max-prof", style: { fontStyle: "Courier New" } },
          "Max Bet: ",
          Clib.formatDecimals(3000)
        ),
        // D.td(null, (Clib.winProb(this.state.amount, this.state.cashOut) * 100), '%')
        D.canvas({
          ref: "canvas",
          id: "grapfof",
          style: { fontStyle: "Courier New", zIndex: 1 },
            // className: this.state.graphMode === "text" ? "hide" : "",
        }),
        textDisplay
      );
    },
  });
});
