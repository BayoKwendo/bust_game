define(["react", "game-logic/clib", "game-logic/engine"], function (
  React,
  Clib,
  Engine
) {
  /** Constants **/
  var MAX_GAMES_SHOWED = 50;

  var D = React.DOM;

  function getState() {
    return {
      engine: Engine,
    };
  }

  function copyHash(gameId, hash) {
    return function () {
      prompt("Game " + gameId + " Hash: ", hash);
    };
  }

  return React.createClass({
    displayName: "gamesLog",

    getInitialState: function () {
      return getState();
    },

    componentDidMount: function () {
      Engine.on({
        game_crash: this._onChange,
      });
    },

    componentWillUnmount: function () {
      Engine.off({
        game_crash: this._onChange,
      });
    },

    _onChange: function () {
      //Check if its mounted because when Game view receives the disconnect event from EngineVirtualStore unmounts all views
      //and the views unregister their events before the event dispatcher dispatch them with the disconnect event
      if (this.isMounted()) this.setState(getState());
    },

    render: function () {
      var self = this;

      console.log("history", self.state.engine.tableHistory);
      var rows = self.state.engine.tableHistory
        .slice(0, MAX_GAMES_SHOWED)
        .map(function (game, i) {
          var cashed_at, bet, profit, bonus;
          var player = game.player_info[self.state.engine.username];

          if (player) {
            bonus = player.bonus;
            bet = player.bet;

            //If the player won
            if (player.stopped_at) {
              // alert(player.stopped_at)

              profit = player.stopped_at * player.bet;

              console.log("stopped at" + player.bet);
              console.log(profit);
              cashed_at = Clib.formatSatoshis(player.stopped_at);

              //If the player lost
            } else {
              profit = -bet;

              cashed_at = "-";

              // if (profit < 1) {
              profit = 0;
              // }
            }

            //If we got a bonus
            // if (bonus) {
            //     profit = profit + bonus;
            //     bonus = Clib.formatDecimals(bonus/bet, 2)+'%';

            //     if (profit < 1) {
            //         profit = 0
            //     }

            // } else {
            //     bonus = '0%';
            // }

            // profit = profit;
            bet = Clib.formatSatoshis(bet);

            //If we didn't play
          } else {
            cashed_at = "-";
            bet = "-";
            profit = 0;
            bonus = "-";
          }

          var className;
          if (game.game_crash >= 2) className = "games-log-goodcrash";
          else if (game.game_crash <= 2) className = "games-log-badcrash";
          else className = "";

          return D.tr(
            { key: "game_" + i },

            D.td(
              null,
              D.a(
                {
                  className: className,
                },
                Clib.formatSatoshis(game.game_crash),
                D.i(null, "x")
              )
            ),

            // D.td(null,
            //         D.a({ href: '/game/' + game.game_id, target: '_blank',
            //             className: className
            //         },
            //             Clib.formatSatoshis(game.game_crash), D.i(null, 'x'))
            //         ),

            D.td(null, cashed_at),
            D.td(null, bet),
            // D.td(null, bonus),
            D.td(null, Clib.formatDecimals(profit))
            // D.td(null,
            //     D.input({type: 'input', className: 'games-log-hash', readOnly: true, value: game.hash }),
            //     D.div({ className: 'hash-copy-cont', onClick: copyHash(game.game_id, game.hash) },
            //         D.span({ className: 'hash-copy' }, D.i({ className: 'fa fa-clipboard' })))
            // )
          );
        });

      return D.div(
        { id: "games-log-container" },
        D.div({ className: "header-bg" }),
        D.div(
          { className: "table-inner" },
          D.table(
            { className: "games-log" },
            D.thead(
              null,
              D.tr(
                null,

                D.th(null, D.div({ className: "th-inner" }, "Krash")),
                D.th(null, D.div({ className: "th-inner" }, "@")),
                D.th(null, D.div({ className: "th-inner" }, "Amount")),
                // D.th(null, D.div({ className: 'th-inner'}, 'Bonus')),
                D.th(null, D.div({ className: "th-inner" }, "Crash"))
                // D.th(null, D.div({ className: 'th-inner'}, 'Hash'))
              )
            ),
            D.tbody(null, rows)
          )
        )
      );
    },
  });
});
