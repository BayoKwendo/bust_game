define([
  "react",
  "game-logic/engine",
  "stores/GameSettingsStore",
  "actions/GameSettingsActions",
  "game-logic/clib",
  "screenfull",
], function (
  React,
  Engine,
  GameSettingsStore,
  GameSettingsActions,
  Clib,
  Screenfull //Attached to window.screenfull
) {
  var D = React.DOM;

  function getState() {
    return {
      balanceBitsFormatted: Clib.formatSatoshis(Engine.balanceSatoshis),
      theme: GameSettingsStore.getCurrentTheme(), //black || white
    };
  }

  return React.createClass({
    displayName: "TopBar",

    propTypes: {
      isMobileOrSmall: React.PropTypes.bool.isRequired,
    },

    getInitialState: function () {
      var state = getState();
      state.username = Engine.username;
      state.fullScreen = false;
      return state;
    },

    componentDidMount: function () {
      Engine.on({
        game_started: this._onChange,
        game_crash: this._onChange,
        cashed_out: this._onChange,
      });
      GameSettingsStore.on("all", this._onChange);
    },

    componentWillUnmount: function () {
      Engine.off({
        game_started: this._onChange,
        game_crash: this._onChange,
        cashed_out: this._onChange,
      });
      GameSettingsStore.off("all", this._onChange);
    },

    _onChange: function () {
      this.setState(getState());
    },

    _toggleTheme: function () {
      GameSettingsActions.toggleTheme();
    },

    _toggleFullScreen: function () {
      window.screenfull.toggle();
      this.setState({ fullScreen: !this.state.fullScreen });
    },

    render: function () {
      var userLogin;
      if (this.state.username) {
        userLogin = D.div(
          { className: "user-login" },

          D.div(
            { className: "deposit" },
            D.a(
              { href: "/referral" },
              this.props.isMobileOrSmall ? "" : "AFFILIATE PROGRAM"
            )
          ),

          D.div(
            { className: "deposit" },
            D.a({ href: "/deposits" }, "DEPOSIT")
          ),

          // D.div({ className: 'username' },
          //     D.a({ href: 'tel:07062302334', className:"fa fa-phone" }, ""
          //     )),

          D.div(
            { className: "balance-bits" },
            D.span(
              { className: "balance" },
              `Ksh${this.state.balanceBitsFormatted}`
            )
          ),
          D.div(
            { className: "deposit" },
            D.a({ href: "/account", className: "fa fa-bars" }, "")
          )
        );

        
      } else {
        userLogin = D.div(
          { className: "user-login" },
          D.div(
            { className: "register" },
            D.a({ href: "/register" }, "Register")
          ),
          D.div({ className: "login" }, D.a({ href: "/login" }, "Log in"))
        );
      }

      return D.div(
        { id: "top-bar" },
        D.div(
          { className: "title text-white", id: "title_kashout" },
          D.a(
            { href: "/" },
            D.h1(null, this.props.isMobileOrSmall ? "SB" : "SupaBasta")
          )
        ),
        userLogin
        // D.div({ className: 'toggle-view noselect' + ((this.state.theme === 'white')? ' black' : ' white'), onClick: this._toggleTheme },
        //     D.a(null,
        //         (this.state.theme === 'white')? 'Go black' : 'Go back'
        //     )
        // ),
        // D.div({ className: 'full-screen noselect', onClick: this._toggleFullScreen },
        // 	 this.state.fullScreen? D.i({ className: 'fa fa-compress' }) : D.i({ className: 'fa fa-expand' })
        // )
      );
    },
  });
});
