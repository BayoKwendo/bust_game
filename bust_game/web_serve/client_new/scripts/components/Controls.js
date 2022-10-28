define([
    'react',
    'game-logic/clib',
    'game-logic/stateLib',
    'lodash',
    'components/BetButton',
    'actions/ControlsActions',
    'stores/ControlsStore',
    'game-logic/engine'
], function (
    React,
    Clib,
    StateLib,
    _,
    BetButtonClass,
    ControlsActions,
    ControlsStore,
    Engine
) {
    var BetButton = React.createFactory(BetButtonClass);

    var D = React.DOM;

    function getState() {
        return {
            betSize: ControlsStore.getBetSize(), //Bet input string in bits
            betInvalid: ControlsStore.getBetInvalid(), //false || string error message
            cashOut: ControlsStore.getCashOut(),
            cashOutInvalid: ControlsStore.getCashOutInvalid(), //false || string error message
            engine: Engine
        }
    }

    return React.createClass({
        displayName: 'Controls',

        propTypes: {
            isMobileOrSmall: React.PropTypes.bool.isRequired,
            controlsSize: React.PropTypes.string.isRequired
        },

        getInitialState: function () {
            return getState();
        },

        componentDidMount: function () {
            ControlsStore.addChangeListener(this._onChange);
            Engine.on({
                game_started: this._onChange,
                game_crash: this._onChange,
                game_starting: this._onChange,
                player_bet: this._onChange,
                cashed_out: this._onChange,
                placing_bet: this._onChange,
                bet_placed: this._onChange,
                bet_queued: this._onChange,
                cashing_out: this._onChange,
                cancel_bet: this._onChange
            });
        },

        componentWillUnmount: function () {
            ControlsStore.removeChangeListener(this._onChange);
            Engine.off({
                game_started: this._onChange,
                game_crash: this._onChange,
                game_starting: this._onChange,
                player_bet: this._onChange,
                cashed_out: this._onChange,
                placing_bet: this._onChange,
                bet_placed: this._onChange,
                bet_queued: this._onChange,
                cashing_out: this._onChange,
                cancel_bet: this._onChange
            });
        },

        _onChange: function () {
            if (this.isMounted())
                this.setState(getState());
        },

        _placeBet: function () {
            var bet = StateLib.parseBet(this.state.betSize);
            var cashOut = StateLib.parseCashOut(this.state.cashOut);
            ControlsActions.placeBet(bet, cashOut);
        },

        _cancelBet: function () {
            ControlsActions.cancelBet();
        },

        _cashOut: function () {
            ControlsActions.cashOut();
        },

        _setBetSize: function (betSize) {
            ControlsActions.setBetSize(betSize);
        },

        _setAutoCashOut: function (autoCashOut) {
            ControlsActions.setAutoCashOut(autoCashOut);
        },

        _redirectToLogin: function () {
            window.location = '/login';
        },

        // play: function () {
        //     this.refs.joyride.start(true);
        // },

        // clickFunctionCalled = new EventEmitter < any > ()
        // callFunction() {
        //     this.clickFunctionCalled.emit();
        // },
        render: function () {
            var self = this;

            var isPlayingOrBetting = StateLib.isBetting(Engine) || (Engine.gameState === 'IN_PROGRESS' && StateLib.currentlyPlaying(Engine));

            // If they're not logged in, let just show a login to play
            if (!Engine.username)
                return D.div({ id: 'controls-inner-container' },
                    D.div({ className: 'login-button-container' },
                        D.button({ className: 'login-button bet-button', onClick: this._redirectToLogin }, 'Login to Play')
                    ),
                    D.div({ className: 'register-container', id: 'register-container' },
                        D.a({ className: 'register', href: '/register' }, 'Register'),

                        D.a({ className: 'how_to_play', id: 'how_to_play' }, 'How to Play ')
                    ),



                );

            /** Control Inputs: Bet & AutoCash@  **/
            //var controlInputs = [], betContainer
            var betContainer = D.div({ className: 'bet-container', id: 'bet-container', key: 'ci-1', style: { fontStyle: 'Courier New' } },
                D.div({ className: 'bet-input-group' + (this.state.betInvalid ? ' error' : '') },
                    D.span({ style: { color: 'white', fontStyle: "bold", float: 'left' } }, 'Bet Amount'),
                    D.input({
                        type: 'text',
                        name: 'bet-size',
                        value: self.state.betSize,
                        className: 'input_th',
                        disabled: isPlayingOrBetting,
                        onChange: function (e) {
                            self._setBetSize(e.target.value);
                        }
                    }),
                ),
            );
            var autoCashContainer = D.div({ className: 'autocash-container', id: 'autocash-container', key: 'ci-2', style: { fontStyle: 'Courier New' } },

                D.div({ className: 'bet-input-group' + (this.state.cashOutInvalid ? ' error' : '') },
                    D.span({ style: { color: 'white', fontStyle: "bold", float: 'left' } }, 'AutoCrash(X)'),
                    D.input({
                        min: 1,
                        step: 0.01,
                        value: self.state.cashOut,
                        type: 'number',
                        className: 'input_th',
                        name: 'cash-out',
                        disabled: isPlayingOrBetting,
                        onChange: function (e) {
                            self._setAutoCashOut(e.target.value);
                        }
                    })
                    ,
                    D.a({ className: 'max-profit' },
                        'Target Profit: ', Clib.formatDecimals((StateLib.parseBet(self.state.betSize) * StateLib.parseCashOut(self.state.cashOut)) - StateLib.parseBet(self.state.betSize)), ' /='
                    ),

                    D.a({ className: 'max-win' },
                        'Win Chance ', (Clib.winProb(self.state.betSize, self.state.cashOut)), '%'
                    ),

                )

            );

            var controlInputs;
            if (this.props.isMobileOrSmall || this.props.controlsSize === 'small') {
                controlInputs = D.div({ className: 'control-inputs-container' },
                    D.div({ className: 'input-control' },
                        betContainer
                    ),

                    D.div({ className: 'input-control' },
                        autoCashContainer
                    )
                );
            } else {
                controlInputs = [];

                controlInputs.push(D.div({ className: 'input-control controls-row', key: 'coi-1' },
                    betContainer
                ));

                controlInputs.push(D.div({ className: 'input-control controls-row', key: 'coi-2' },
                    autoCashContainer
                ));
            }

            //If the user is logged in render the controls
            return D.div({ id: 'controls-inner-container', className: this.props.controlsSize, style: { fontStyle: 'Courier New' } },



                D.span({ id: 'contro-inner-controls' },
                    controlInputs,
                ),
                D.div({ className: 'contro-inner-controls-how-to-play' },
                    D.a({ id: 'how_to_play' }, 'How to Play '),
                ),// 

                D.div({ className: 'button-container' },
                    BetButton({
                        engine: this.state.engine,
                        placeBet: this._placeBet,
                        cancelBet: this._cancelBet,
                        cashOut: this._cashOut,
                        isMobileOrSmall: this.props.isMobileOrSmall,
                        betSize: this.state.betSize,
                        betInvalid: this.state.betInvalid,
                        cashOutInvalid: this.state.cashOutInvalid,
                        controlsSize: this.props.controlsSize
                    })
                ),


            );

        }

        //_getStatusMessage: function () {
        //    var pi = this.state.engine.currentPlay();
        //
        //    if (this.state.engine.gameState === 'STARTING') {
        //        return Countdown({ engine: this.state.engine });
        //    }
        //
        //    if (this.state.engine.gameState === 'IN_PROGRESS') {
        //        //user is playing
        //        if (pi && pi.bet && !pi.stopped_at) {
        //            return D.span(null, 'Currently playing...');
        //        } else if (pi && pi.stopped_at) { // user has cashed out
        //            return D.span(null, 'Cashed Out @  ',
        //                D.b({className: 'green'}, pi.stopped_at / 100, 'x'),
        //                ' / Won: ',
        //                D.b({className: 'green'}, Clib.formatSatoshis(pi.bet * pi.stopped_at / 100)),
        //                ' ', Clib.grammarBits(pi.bet * pi.stopped_at / 100)
        //            );
        //
        //        } else { // user still in game
        //            return D.span(null, 'Game in progress..');
        //        }
        //    } else if (this.state.engine.gameState === 'ENDED') {
        //
        //        var bonus;
        //        if (pi && pi.stopped_at) { // bet and won
        //
        //            if (pi.bonus) {
        //                bonus = D.span(null, ' (+',
        //                    Clib.formatSatoshis(pi.bonus), ' ',
        //                    Clib.grammarBits(pi.bonus), ' bonus)'
        //                );
        //            }
        //
        //            return D.span(null, 'Cashed Out @ ',
        //                D.b({className: 'green'}, pi.stopped_at / 100, 'x'),
        //                ' / Won: ',
        //                D.b({className: 'green'}, Clib.formatSatoshis(pi.bet * pi.stopped_at / 100)),
        //                ' ', Clib.grammarBits(pi.bet * pi.stopped_at / 1000),
        //                bonus
        //            );
        //        } else if (pi) { // bet and lost
        //
        //            if (pi.bonus) {
        //                bonus = D.span(null, ' (+ ',
        //                    Clib.formatSatoshis(pi.bonus), ' ',
        //                    Clib.grammarBits(pi.bonus), ' bonus)'
        //                );
        //            }
        //
        //            return D.span(null,
        //                'Busted @ ', D.b({className: 'red'},
        //                    this.state.engine.tableHistory[0].game_crash / 100, 'x'),
        //                ' / You lost ', D.b({className: 'red'}, pi.bet / 100), ' ', Clib.grammarBits(pi.bet),
        //                bonus
        //            );
        //
        //        } else { // didn't bet
        //
        //          if (this.state.engine.tableHistory[0].game_crash === 0) {
        //            return D.span(null, D.b({className: 'red'}, 'INSTABUST!'));
        //          }
        //
        //          return D.span(null,
        //              'Busted @ ', D.b({className: 'red'}, this.state.engine.tableHistory[0].game_crash / 100, 'x')
        //          );
        //        }
        //
        //    }
        //}
    });
});