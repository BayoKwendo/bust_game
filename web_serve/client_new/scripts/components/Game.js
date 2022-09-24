/**
 * This view acts as a wrapper for all the other views in the game
 * it is subscribed to changes in EngineVirtualStore but it only
 * listen to connection changes so every view should subscribe to
 * EngineVirtualStore independently.
 */
define([
  "react",
  "joyrider",
  "components/TopBar",
  "components/ChartControls",
  "components/TabsSelector",
  "components/Players",
  "components/BetBar",
  "game-logic/engine",
  "game-logic/clib",
  "game-logic/hotkeys",
  "stores/GameSettingsStore",
  "components/ControlsSelector",
], function (
  React,
  Joyride,
  TopBarClass,
  ChartControlsClass,
  TabsSelectorClass,
  PlayersClass,
  BetBarClass,
  Engine,
  Clib,
  Hotkeys,
  GameSettingsStore,
  ControlsSelectorClass
) {
  var TopBar = React.createFactory(TopBarClass);
  //var SpaceWrap = React.createFactory(SpaceWrapClass);
  var ChartControls = React.createFactory(ChartControlsClass);
  var ControlsSelector = React.createFactory(ControlsSelectorClass);

  var TabsSelector = React.createFactory(TabsSelectorClass);
  var Players = React.createFactory(PlayersClass);
  var BetBar = React.createFactory(BetBarClass);

  var BetBar = React.createFactory(BetBarClass);

  var JoyRider = React.createFactory(Joyride);

  var D = React.DOM;

  return React.createClass({
    displayName: "Game",

    getInitialState: function () {
      console.log("playffer", USER_MESSAGE.notlogged);

      var state = GameSettingsStore.getState();
      state.isConnected = Engine.isConnected;
      // state.username = Engine.username;
      state.showMessage = true;
      state.ready = false;
      state.steps = [
        {
          text: "Supabasta is a game that allows you to stake a BET, then watch your possible winning grow every second as the graph grows. <br/> You have a chance to LuckyBust and win instantly, up to 100 X BET amount, before the game Krashes. <br/><br/> Bet, and CsshOut, Before you BustOut",
          selector: "#title_kashout",
          position: "bottom",
        },
        {
          text: "On every round, your BET Multiplier starts at 1x and keeps rising.<br/>The higher it climbs, the more your possible winning becomes.<br/>In order to win, tap on the LuckyBust button before the graph krashes.<br/>Remember:<br/> Bet, and CsshOut, Before you BustOut",
          selector: "#grapfof",
          position: "bottom-left",
        },
        {
          text: "Please REGISTER or LOGIN to play and win up to 100 X your BET amount.",
          selector: "#register-container",
          position: "bottom",
          disableBeacon: true,
        },
      ];

      state.steps_logged = [
        // {
        //     text: "LuckyBust is a game that allows you to stake a BET, then watch your possible winning grow every second as the graph grows. <br/> You have a chance to LuckyBust and win instantly, up to 100 X BET amount, before the game Krashes. <br/><br/> Bet, and LuckyBust, Before you BustOut",
        //     selector: '#title_LuckyBust',
        //     position: 'bottom',
        // },
        // {
        //     text: "On every round, the graph starts at 1x and keeps growing up.<br/>The higher it goes, the higher your possible winning.<br/><br/>Remember:<br/> Bet, and LuckyBust, Before you BustOut",
        //     selector: '#grapfof',
        //     position: 'bottom-left',
        // },

        {
          text: "Enter the BET amount you want to play with,  between 10/= and 3000/=",
          selector: "#bet-container",
          position: "bottom",
        },
        {
          text: "Set your automatic LuckyBust level to any figure above 1, (for example 1.5, 4.5,100), before you start playing.<br/><br/>Feel free to LuckyBust and WIN, anytime before your automatic LuckyBust is attained. <br/><br/> Remember: <br />Bet, and CsshOut, Before you BustOut!",
          selector: "#autocash-container",
          position: "bottom",
        },
        {
          text: "Click BET to play the game. <br/><br/>When it turns red be patient for the new game to start. <br/><br/>When it turns Orange, feel free to LuckyBust or wait for your automatic LuckyBust.<br/><br/>Remember:<br/>Bet, and CsshOut, Before you BustOut!",
          selector: "#button-container",
          position: "top",
        },
      ];
      state.isMobileOrSmall = Clib.isMobileOrSmall(); //bool

      return state;
    },

    componentDidMount: function () {
      Engine.on({
        connected: this._onEngineChange,
        disconnected: this._onEngineChange,
      });

      // window.onhashchange = function () {
      //     if (window.innerDocClick) {
      //         window.innerDocClick = false;
      //     } else {
      //         console.log("here")

      //         if (window.location.hash != '#undefined') {
      //             goBack();
      //         } else {
      //             history.pushState("", document.title, window.location.pathname);
      //             location.reload();
      //         }
      //     }
      // }

      this.addSteps(this.state.steps);

      setTimeout(() => { }, 3000);

      GameSettingsStore.addChangeListener(this._onSettingsChange);

      window.addEventListener("resize", this._onWindowResize);

      Hotkeys.mount();
    },

    componentDidUpdate: function (prevProps, prevState) {
      if (!prevState.ready && this.state.ready) {
        // console.log('start here today');
      }
    },

    componentWillUnmount: function () {
      Engine.off({
        connected: this._onChange,
        disconnected: this._onChange,
      });

      window.removeEventListener("resize", this._onWindowResize);

      Hotkeys.unmount();
    },

    _onEngineChange: function () {
      if (this.state.isConnected != Engine.isConnected && this.isMounted()) {
        this.setState({ isConnected: Engine.isConnected });
        var c = document.getElementById("how_to_play");
        if (c) {
          c.onclick = () => {
            this.play();
          };
        }
        if (this.refs != undefined) {
          if (this.refs.joyride != undefined) {
            // this.refs.joyride.start(true);
          }
        }

        // this.refs.joyride.start(true);
      }
    },

    _onSettingsChange: function () {
      if (this.isMounted()) this.setState(GameSettingsStore.getState());
    },

    _onWindowResize: function () {
      var isMobileOrSmall = Clib.isMobileOrSmall();
      if (this.state.isMobileOrSmall !== isMobileOrSmall)
        this.setState({ isMobileOrSmall: isMobileOrSmall });
    },

    _hideMessage: function () {
      this.setState({ showMessage: false });
    },

    addSteps: function (steps) {
      if (!steps || typeof steps !== "object") return false;

      this.setState(function (currentState) {
        currentState.steps = currentState.steps;
        return currentState;
      });
    },

    addTooltip: function (data) {
      console.log("DATA ", data);
      this.refs.joyride.addTooltip(data);
    },

    play: function () {
      this.refs.joyride.reset(true);
      this.refs.joyride.start(true);
    },

    // joy rider callback
    callback: function (e) {
      if (e.type == "finished") {
        // this.refs.joyride.reset(true)
      }
      console.log("callback", e);
      // this.refs.joyride.start(true)
    },

    // addTooltip(data) {
    //     this.refs.joyride.addTooltip(data);
    // },
    render: function () {
      const checkout =
        typeof window !== "undefined"
          ? localStorage.getItem("previouslyVisited")
          : null;
      // var show = window.localstorage.getItem('previouslyVisited')

      if (!this.state.isConnected)
        return D.div(
          { id: "loading-container" },
          D.div(
            { className: "loading-image" },
            D.span({ className: "bubble-1" }),
            D.span({ className: "bubble-2" }),
            D.span({ className: "bubble-3" })
          )
        );

      var messageContainer;

      if (this.state.showMessage) {
        var messageContent,
          messageClass,
          containerClass = "show-message";

        // console.log("checkout", checkout)

        if (checkout == "true") {
          // console.log("checkout", checkout)
          // typeof window !== 'undefined' ? localStorage.setItem('previouslyVisited', false) : null

          messageContent = null;
          messageClass = "hide";
          containerClass = "";
        } else {
          typeof window !== "undefined"
            ? localStorage.setItem("previouslyVisited", true)
            : null;
          console.log("checkout", checkout);

          // console.log("checkout", checkout)
          // messageContent = D.span(null,
          //     D.p({ href: '/request' }, 'LuckyBust is a game which lets you multiply your money. \n A new game starts when the count down moves from 5 seconds to zero'),
          //     D.p({ href: '/request', style: { marginTop: "20px" } }, 'Every round of the game, you have the opportunity to place a bet before the round starts'),
          //     D.p({ href: '/request', style: { marginTop: "20px" } }, 'The LuckyBust Multiplier starts at 1x and begins to climb up every second higher and higher upto to the crashing point.'),
          //     D.p({ href: '/request', style: { marginTop: "20px" } }, 'Look at the LuckyBust Multiplier and LuckyBust before the round crashes.'),
          //     D.p({ href: '/request', style: { marginTop: "20px" } }, 'Register to start playing and click on deposit to top up from your bank account'),
          //     D.p({ href: '/request', style: { marginTop: "20px" } }, 'Click on history to seee previous round crashing point, Click to see people who youre playing with, click on chat to talk chat with Customer care')),

          messageClass = "hide";
        }

        // if (USER_MESSAGE.type == 'undefined') {
        // }

        switch (USER_MESSAGE.type) {
          case "error":
            messageContent = D.span(null, D.span(null, USER_MESSAGE.text));
            messageClass = "error";
            break;
          case "newUser":
            messageContent = D.span(
              null,
              D.a(
                { href: "/request" },
                "Welcome to bustabit.com, to start you have 2 free bits, bits you can request them here or you can just watch the current games... have fun :D"
              )
            );
            messageClass = "new-user";
            break;
          case "received":
            messageContent = D.span(
              null,
              D.span(
                null,
                "Congratulations you have been credited " +
                USER_MESSAGE.qty +
                " free bits. Have fun!"
              )
            );
            messageClass = "received";
            break;
          case "advice":
            messageContent = D.span(null, D.span(null, USER_MESSAGE.advice));
            messageClass = "advice";
            break;

          case "first_time":
            // checkout != true ?
            //     <>
            // </>
            // : null
            break;
          default:
            messageContent = null;
            messageClass = "hide";
            containerClass = "";
        }

        messageContainer = D.div(
          { id: "game-message-container", className: messageClass },

          D.p({ className: "cash_message" }, D.b({}, "Welcome to LuckyBust")),
          D.div({ id: "game-scroll" }, messageContent),
          D.p(
            { className: "close-message", onClick: this._hideMessage },
            D.i({ className: "fa fa-times" })
          )
        );
      } else {
        messageContainer = null;
        containerClass = "";
      }

      var rightContainer = !this.state.isMobileOrSmall
        ? D.div({ id: "game-right-container" }, Players(), BetBar())
        : null;

      return D.div(
        { id: "game-inner-container" },

        // this.state.ready ?
        JoyRider({
          ref: "joyride",
          steps: USER_MESSAGE.notlogged
            ? this.state.steps
            : this.state.steps_logged,
          debug: true,
          showOverlay: true,
          type: "continuous",
          floaterProps: {
            styles: {
              wrapper: {
                zIndex: 1000,
              },
            },
          },

          showSkipButton: true,
          showStepsProgress: true,
          callback: (e) => {
            this.callback(e);
          },
        }),
        // : null,

        TopBar({
          isMobileOrSmall: this.state.isMobileOrSmall,
        }),

        messageContainer,

        D.div(
          {
            id: "game-playable-container",
            className: containerClass,
          },
          // D.p({ style: { 'color': 'red' }, className: "my-first-step", onClick: this.play }, "helldkkdk kfkfkf kfkffk kkfkfk kfkkf  nnngn jfdjd jddjlo"),

          D.div(
            {
              id: "game-left-container",
              className: this.state.isMobileOrSmall ? " small-window" : "",
            },
            D.div(
              { id: "chart-controls-container" },
              D.div(
                {
                  id: "chart-controls-col",
                  className: this.state.controlsSize,
                },
                D.div(
                  { className: "cell-wrapper" },
                  ChartControls({
                    isMobileOrSmall: this.state.isMobileOrSmall,
                    controlsSize: this.state.controlsSize,
                  })
                )
              )
            ),
            D.div(
              { id: "tabs-controls-row" },
              D.div(
                { id: "tabs-controls-col" },
                D.div(
                  { className: "cell-wrapper" },
                  TabsSelector({
                    isMobileOrSmall: this.state.isMobileOrSmall,
                    controlsSize: this.state.controlsSize,
                  })
                )
              )
            )
          ),
          D.div(
            { id: "controls-container", className: this.props.controlsSize },
            ControlsSelector({
              isMobileOrSmall: this.props.isMobileOrSmall,
              controlsSize: this.props.controlsSize,
            }),

            rightContainer,

          ),

          D.span(
            { className: "footer_game" },
            "@ 2022 SupaBasta. \nSupaBasta  ",
            D.a({ href: "tel:0700000000" }, "0700000000")
          )
        ),

      );
    },
  });
});
