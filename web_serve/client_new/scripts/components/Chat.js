define([
    'react',
    'game-logic/clib',
    'autolinker',
    'stores/ChatStore',
    'actions/ChatActions',
    'stores/GameSettingsStore',
    'game-logic/chat',
    'components/ChatChannelSelector'
], function (
    React,
    Clib,
    Autolinker,
    ChatStore,
    ChatActions,
    GameSettingsStore,
    ChatEngine,
    ChatChannelSelectorClass
) {
    // Overrides Autolinker.js' @username handler to instead link to
    // user profile page.
    var replaceUsernameMentions = function (autolinker, match) {
        // Use default handler for non-twitter links
        if (match.getType() !== 'twitter') return true;

        var username = match.getTwitterHandle();
        return '<a href="/user/' + username + '" target="_blank">@' + username + '</a>';
    };

    var escapeHTML = (function () {
        var entityMap = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': '&quot;',
            "'": '&#39;'
        };

        return function (str) {
            return String(str).replace(/[&<>"']/g, function (s) {
                return entityMap[s];
            });
        };
    })();

    var D = React.DOM;

    var ChatChannelSelector = React.createFactory(ChatChannelSelectorClass);

    /* Constants */
    var SCROLL_OFFSET = 120;

    function getState(evName) {
        var state = ChatStore.getState();
        state.ignoredClientList = GameSettingsStore.getIgnoredClientList();
        state.evName = evName;
        return state;
    }

    return React.createClass({
        displayName: 'Chat',

        propTypes: {
            isMobileOrSmall: React.PropTypes.bool.isRequired
        },

        getInitialState: function () {


            /* Avoid scrolls down if a render is not caused by length chat change */
            this.listLength = ChatEngine.history.length;

            return getState();
        },

        componentDidMount: function () {
            ChatEngine.on('all', this._onChange); //Use all events
            ChatStore.addChangeListener(this._onChange); //Use all events
            GameSettingsStore.addChangeListener(this._onChange); //Not using all events but the store does not emits a lot

            //If messages are rendered scroll down to the bottom
            if (this.refs.messages) {
                var msgsNode = this.refs.messages.getDOMNode();
                msgsNode.scrollTop = msgsNode.scrollHeight;
            }
        },

        componentWillUnmount: function () {
            ChatEngine.off('all', this._onChange);
            ChatStore.removeChangeListener(this._onChange);
            GameSettingsStore.removeChangeListener(this._onChange);

            var height = this.refs.messages.getDOMNode().style.height;
            ChatActions.setHeight(height);
        },

        /** If the length of the chat changed and the scroll position is near bottom scroll to the bottom **/
        componentDidUpdate: function (prevProps, prevState) {

            if (this.state.evName === 'joined') {//On join scroll to the bottom
                var msgsNode = this.refs.messages.getDOMNode();
                msgsNode.scrollTop = msgsNode.scrollHeight;

            } else if (ChatEngine.history.length != this.listLength) { //If there is a new message scroll to the bottom if is near to it

                this.listLength = ChatEngine.history.length;

                //If messages are rendered scroll down
                if (this.refs.messages) {
                    var msgsBox = this.refs.messages.getDOMNode();
                    var scrollBottom = msgsBox.scrollHeight - msgsBox.offsetHeight - msgsBox.scrollTop;

                    if (scrollBottom < SCROLL_OFFSET)
                        msgsBox.scrollTop = msgsBox.scrollHeight;
                }
            }
        },

        _onChange: function (evName) {
            if (this.isMounted())
                this.setState(getState(evName));
        },

        _sendMessage: function (e) {
            if (e.keyCode == 13) {
                //var msg = this.state.inputText;
                var msg = e.target.value;
                msg = msg.trim();

                if (!this._doCommand(msg)) { //If not command was done is a message(or command) to the server
                    if (msg.length >= 1 && msg.length < 500) {
                        this._say(msg);
                        e.target.value = '';
                    }
                } else { //If a command was done erase the command text
                    e.target.value = '';
                }
            }
        },

        //Returns true if a command was done, false if not
        _doCommand: function (msg) {

            //Check if is command
            var cmdReg = /^\/([a-zA-z]*)\s*(.*)$/;
            var cmdMatch = msg.match(cmdReg);

            if (!cmdMatch)
                return;

            var cmd = cmdMatch[1];
            var rest = cmdMatch[2];

            switch (cmd) {
                case 'ignore':

                    if (ChatEngine.username === rest) {
                        ChatActions.showClientMessage('Cant ignore yourself');

                    } else if (Clib.isInvalidUsername(rest)) {
                        ChatActions.showClientMessage('Invalid Username');

                    } else if (!this.state.ignoredClientList.hasOwnProperty(rest.toLowerCase())) {
                        ChatActions.ignoreUser(rest);
                        ChatActions.showClientMessage('User ' + rest + ' ignored');

                    } else
                        ChatActions.showClientMessage('User ' + rest + ' was already ignored');

                    return true;

                case 'unignore':

                    if (Clib.isInvalidUsername(rest)) {
                        ChatActions.showClientMessage('Invalid Username');

                    } else if (this.state.ignoredClientList.hasOwnProperty(rest.toLowerCase())) {

                        ChatActions.approveUser(rest);
                        ChatActions.showClientMessage('User ' + rest + ' approved');

                    } else
                        ChatActions.showClientMessage('User ' + rest + ' was already approved');

                    return true;

                case 'ignored':
                    ChatActions.listMutedUsers(this.state.ignoredClientList);
                    return true;

                default:
                    return false;
            }
        },

        _say: function (msg) {
            ChatActions.say(msg);
        },

        _updateInputText: function (ev) {
            ChatActions.updateInputText(ev.target.value);
        },

        _selectChannel: function (channelName) {
            ChatActions.selectChannel(channelName);
        },

        render: function () {

            /** If the chat is disconnected render a spinner **/
            if (ChatEngine.state === 'DISCONNECTED')
                return D.div({ className: 'messages-container' },
                    D.div({ className: 'loading-container' },
                        ''//Loading spinner is added by css as background
                    ));

            /** If is joining a channel render a spinner inside the chat list **/
            var chatMessagesContainer;
            if (ChatEngine.state == 'CONNECTED') {
                var messages = [];
                for (var i = ChatEngine.history.length - 1; i >= 0; i--)
                    messages.push(this._renderMessage(ChatEngine.history[i], i));

                chatMessagesContainer = D.ul({ className: 'messages', ref: 'messages' },
                    messages
                );
            } else {
                chatMessagesContainer = ChatEngine.state;
            }

            // this.state.engine.username
            /** Chat input is enabled when logged and joined **/
            var chatInput;
            if (ChatEngine.username && ChatEngine.state == 'CONNECTED')
                chatInput = D.input( //Input is not binded due to slowness on some browsers
                    {
                        className: 'chat-input',
                        onKeyDown: this._sendMessage,
                        //onChange: this._updateInputText,
                        //value: this.state.inputText,
                        maxLength: '500',
                        ref: 'input',
                        id: "input_text",
                        placeholder: 'Type here...'
                    }
                );
            else
                chatInput = D.input(
                    {
                        className: 'chat-input',
                        ref: 'input',
                        id: "input_text",
                        placeholder: 'Log in to chat...',
                        disabled: true
                    }
                );

            return D.div({ className: 'messages-container' },

                chatMessagesContainer,

                D.div({ className: 'chat-input-container' },
                    chatInput,
                    // ChatChannelSelector({
                    //     selectChannel: this._selectChannel,
                    //     selectedChannel: ChatEngine.channelName,
                    //     isMobileOrSmall: this.props.isMobileOrSmall,
                    //     moderator: ChatEngine.moderator
                    // })
                ),
                D.div({ className: 'spinner-pre-loader' })
            );
        },

        _renderMessage: function (message, index) {

            var pri = 'msg-chat-message';
            switch (message.type) {
                case 'say':

                    //If the user is in the ignored client list do not render the message
                    if (this.state.ignoredClientList.hasOwnProperty(message.username.toLowerCase()))
                        return;

                    //Messages starting with '!' are considered as bot except those ones for me
                    if (message.bot || /^!/.test(message.message)) {

                        //If we are ignoring bots and the message is from a bot do not render the message
                        if (this.state.botsDisplayMode === 'none')
                            return;

                        pri += ' msg-bot';

                        if (this.state.botsDisplayMode === 'greyed')
                            pri += ' bot-greyed';
                    }

                    if (message.role === 'admin')
                        pri += ' msg-admin-message';

                    var username = ChatEngine.username;

                    var r = new RegExp('@' + username + '(?:$|[^a-z0-9_\-])', 'i');
                    if (username && message.username != username && r.test(message.message)) {
                        pri += ' msg-highlight-message';
                    }

                    var msgDate = new Date(message.date);
                    var timeString = msgDate.getHours() + ':' + ((msgDate.getMinutes() < 10) ? ('0' + msgDate.getMinutes()) : msgDate.getMinutes()) + ' ';

                    return D.li({ className: "mes", key: 'msg' + index },
                        D.a({
                            href: '/user/' + message.username,
                            id: 'usernam_bod',
                            target: '_blank'
                        },
                            message.username,
                            ':'
                        ),
                        '  ',

                        D.span({
                            className: 'msg-body',
                            id: 'usernam_body',
                            dangerouslySetInnerHTML: {
                                __html: Autolinker.link(
                                    escapeHTML(message.message),
                                    { truncate: 50, replaceFn: replaceUsernameMentions }
                                )
                            }
                        }),
                        ' ',
                        D.span({
                            className: 'time-stamp',
                            id: 'usernam_body',
                            id: 'timestamp'
                        },
                            timeString,
                            D.svg({
                                xmlns: "http://www.w3.org/2000/svg",
                                width: '16',
                                height: '15',
                                id: 'msg-dblcheck-ack',
                            },
                                D.path({
                                    d: 'M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.032l-.358-.325a.32.32 0 0 0-.484.032l-.378.48a.418.418 0 0 0 .036.54l1.32 1.267a.32.32 0 0 0 .484-.034l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.88a.32.32 0 0 1-.484.032L1.892 7.77a.366.366 0 0 0-.516.005l-.423.433a.364.364 0 0 0 .006.514l3.255 3.185a.32.32 0 0 0 .484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z',
                                    fill: 'blue'
                                }))
                        )

                    );
                case 'mute':
                    pri = 'msg-mute-message';
                    return D.li({ className: pri, key: 'msg' + index },
                        D.a({
                            href: '/user/' + message.moderator,
                            target: '_blank'
                        },
                            '*** <' + message.moderator + '>'),
                        message.shadow ? ' shadow muted ' : ' muted ',
                        D.a({
                            href: '/user/' + message.username,
                            target: '_blank'
                        },
                            '<' + message.username + '>'),
                        ' for ' + message.timespec);
                case 'unmute':
                    pri = 'msg-mute-message';
                    return D.li({ className: pri, key: 'msg' + index },
                        D.a({
                            href: '/user/' + message.moderator,
                            target: '_blank'
                        },
                            '*** <' + message.moderator + '>'),
                        message.shadow ? ' shadow unmuted ' : ' unmuted ',
                        D.a({
                            href: '/user/' + message.username,
                            target: '_blank'
                        },
                            '<' + message.username + '>')
                    );
                case 'error':
                case 'info':
                case 'client_message':
                    pri = 'msg-info-message';
                    return D.li({ className: pri, key: 'msg' + index },
                        D.span(null, ' *** ' + message.message));
                    break;
                default:
                    break;
            }
        }
    });

});