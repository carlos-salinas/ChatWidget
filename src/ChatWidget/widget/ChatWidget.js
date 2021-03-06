/*global logger*/
/*
    WidgetName
    ========================

    @file      : WidgetName.js
    @version   : {{version}}
    @author    : {{author}}
    @date      : {{date}}
    @copyright : {{copyright}}
    @license   : {{license}}

    Documentation
    ========================
    Describe your widget here.
*/

// Required module list. Remove unnecessary modules, you can always get them back from the boilerplate.
define([
    "dojo/_base/declare",
    "mxui/widget/_WidgetBase",
    "dijit/_TemplatedMixin",
    "mxui/dom",
    "dojo/dom-style",
    "dojo/dom-construct",
    "dojo/_base/array",
    "dojo/_base/lang",
    "ChatWidget/lib/jquery-1.11.2",
    "dojo/text!ChatWidget/widget/template/ChatWidget.html"
], function (declare, _WidgetBase, _TemplatedMixin, dom, dojoStyle, dojoConstruct, dojoArray, dojoLang, _jQuery, widgetTemplate) {
    "use strict";

    var $ = _jQuery.noConflict(true);

    // Declare widget's prototype.
    return declare("ChatWidget.widget.ChatWidget", [ _WidgetBase, _TemplatedMixin ], {
        // _TemplatedMixin will create our dom node using this HTML template.
        templateString: widgetTemplate,

        // DOM elements
        chatNode: null,
        chatListnode: null,
        sendMessageInputNode: null,
        sendMessageButtonNode: null,

        // Parameters configured in the Modeler.
        chatHeight: null,
        conversationEntity: null,
        messageEntity: null,
        datasourceMf: null,
        mfToSendMessage: "",

        // Internal variables. Non-primitives created in the prototype are shared between all widget instances.
        _handles: null,
        _contextObj: null,
        _messageObjects: null,

        // dojo.declare.constructor is called to construct the widget instance. Implement to initialize non-primitive properties.
        constructor: function () {
            logger.debug(this.id + ".constructor");
            this._handles = [];
            this._messageObjects= [];
        },

        // dijit._WidgetBase.postCreate is called after constructing the widget. Implement to do extra setup work.
        postCreate: function () {
            logger.debug(this.id + ".postCreate");

            if (this.readOnly || this.get("disabled") || this.readonly) {
              this._readOnly = true;
            }

            // Define the height of the widget
            dojoStyle.set(this.chatNode, {
                "height": this.chatHeight,
                "width": "100%",
            });

            this._updateRendering();
            this._setupEvents();
        },

        // mxui.widget._WidgetBase.update is called when context is changed or initialized. Implement to re-render and / or fetch data.
        update: function (obj, callback) {
            logger.debug(this.id + ".update");

            this._contextObj = obj;
            this._resetSubscriptions();
            this._fetchObjects();
            this._updateRendering(callback); // We're passing the callback to updateRendering to be called after DOM-manipulation
        },

        // mxui.widget._WidgetBase.enable is called when the widget should enable editing. Implement to enable editing if widget is input widget.
        enable: function () {
          logger.debug(this.id + ".enable");
        },

        // mxui.widget._WidgetBase.enable is called when the widget should disable editing. Implement to disable editing if widget is input widget.
        disable: function () {
          logger.debug(this.id + ".disable");
        },

        // mxui.widget._WidgetBase.resize is called when the page's layout is recalculated. Implement to do sizing calculations. Prefer using CSS instead.
        resize: function (box) {
          logger.debug(this.id + ".resize");
        },

        // mxui.widget._WidgetBase.uninitialize is called when the widget is destroyed. Implement to do special tear-down work.
        uninitialize: function () {
          logger.debug(this.id + ".uninitialize");
            // Clean up listeners, helper objects, etc. There is no need to remove listeners added with this.connect / this.subscribe / this.own.
        },

        // We want to stop events on a mobile device
        _stopBubblingEventOnMobile: function (e) {
            logger.debug(this.id + "._stopBubblingEventOnMobile");
            if (typeof document.ontouchstart !== "undefined") {
                dojoEvent.stop(e);
            }
        },

        // Attach events to HTML dom elements
        _setupEvents: function () {
            logger.debug(this.id + "._setupEvents");

            this.connect(this.sendMessageButtonNode, "click", function (e){
                // Only on mobile stop event bubbling!
                this._stopBubblingEventOnMobile(e);

                // Create a object messageEntity to set the message text
                mx.data.create({
                    entity: this.messageEntity,
                    callback: dojoLang.hitch(this, function (messageObject) {

                        messageObject.set("Author", mx.session.getUserName());
                        messageObject.set("Message", this.sendMessageInputNode.value);
                        messageObject.set("ConversationId", this._contextObj.get("ConversationID"));
                        messageObject.set("ClientId", this._contextObj.get("ClientID"));

                        mx.data.commit({
                            mxobj: messageObject,
                            callback: dojoLang.hitch(this, function(){

                                // Render the message in the chat
                                this._renderMessage(messageObject, 1, null);

                                // If a microflow has been set execute the microflow on a click.
                                if (this.mfToSendMessage !== "") {
                                    this._execMF(messageObject, this.mfToSendMessage, dojoLang.hitch(this, function(){
                                        // Once the message arrived, the input has to be cleaned up
                                        this.sendMessageInputNode.value = "";
                                    }));
                                }
                            }),
                            error: dojoLang.hitch(this, function(error){
                                logger.error("It failed to commit the object " + messageObject.getGuid() + ": " + error.description);
                            })
                        });
                    }),
                    error: dojoLang.hitch(this, function(error){
                        logger.error("It failed to create an object of type " + this.messageEntity + ": " + error.description);
                    })
                });
            });
        },

        // Rerender the interface.
        _updateRendering: function (callback) {
            logger.debug(this.id + "._updateRendering");

            // Important to clear all validations!
            this._clearValidations();

            // Remove the previous conversation
            dojoConstruct.empty(this.chatListnode);

            // Render each message of the conversation
            this._messageObjects.forEach(dojoLang.hitch(this, this._renderMessage));

            // The callback, coming from update, needs to be executed, to let the page know it finished rendering
            mendix.lang.nullExec(callback);
        },

        _renderMessage: function(obj, index, array){
            logger.debug(this.id + "._renderMessage");

            var messageNode = this._createMessageNode(obj, index);
            dojoConstruct.place(messageNode, this.chatListnode, "last");

            this._updateScroll();
        },

        _createMessageNode: function(obj, index){
            logger.debug(this.id + "._createMessageNode");

            var messageLiClass = "";
            var messageSpanClass = "";
            var messageUserImgSrc = "";
            var messageHeaderDivNode = dojoConstruct.create("div", {"class": "header"});
            var messageChatbodyTextPNode = null;

            if (index % 2 == 0){
                messageLiClass = "left clearfix";
                messageSpanClass = "chat-img pull-left";
                messageUserImgSrc = "http://placehold.it/50/55C1E7/fff&text=WS";

                dojoConstruct.create("strong", {"class": "primary-font", "innerHTML": obj.get("Author")}, messageHeaderDivNode);
                dojoConstruct.create("small", {"class": "pull-right text-muted", "innerHTML": "<span class=\"glyphicon glyphicon-time\"></span>12 mins ago"}, messageHeaderDivNode);
                messageChatbodyTextPNode = dojoConstruct.create("p", {"innerHTML": obj.get("Message")});
            }
            else {
                messageLiClass = "right clearfix";
                messageSpanClass = "chat-img pull-right";
                messageUserImgSrc = "http://placehold.it/50/FA6F57/fff&text=ME";

                dojoConstruct.create("small", {"class": "text-muted", "innerHTML": "<span class=\"glyphicon glyphicon-time\"></span>12 mins ago"}, messageHeaderDivNode);
                dojoConstruct.create("strong", {"class": "pull-right  primary-font", "innerHTML": obj.get("Author")}, messageHeaderDivNode);
                messageChatbodyTextPNode = dojoConstruct.create("p", {"class": "text-right", "innerHTML": obj.get("Message")});
            }

            var messageLiNode = dojoConstruct.create("li", {"class": messageLiClass});
             dojoConstruct.create("span", {"class": messageSpanClass, "innerHTML": "<img src=\"" + messageUserImgSrc + "\" alt=\"User Avatar\" class=\"img-circle\" />"}, messageLiNode);

            var messageChatbodyDivNode =  dojoConstruct.create("div", {"class": "chat-body clearfix"}, null, messageLiNode);

            dojoConstruct.place(messageChatbodyDivNode, messageLiNode, "last");
            dojoConstruct.place(messageHeaderDivNode, messageChatbodyDivNode, "last");
            dojoConstruct.place(messageChatbodyTextPNode, messageChatbodyDivNode, "last");

            return messageLiNode;
        },

        // Make the last message visible
        _updateScroll: function (){
            logger.debug(this.id + "._updateScroll");
            var chatPanelNode = document.querySelectorAll('.chat-panel')[0];
            chatPanelNode.scrollTop = chatPanelNode.scrollHeight;
        },

        // Handle validations.
        _handleValidation: function (validations) {
            logger.debug(this.id + "._handleValidation");
            this._clearValidations();
        },

        // Clear validations.
        _clearValidations: function () {
            logger.debug(this.id + "._clearValidations");
        },

        // Show an error message.
        _showError: function (message) {
            logger.debug(this.id + "._showError");
        },

        // Add a validation.
        _addValidation: function (message) {
            logger.debug(this.id + "._addValidation");
        },

        _unsubscribe: function () {
          if (this._handles) {
              dojoArray.forEach(this._handles, function (handle) {
                  mx.data.unsubscribe(handle);
              });
              this._handles = [];
          }
        },

        // Reset subscriptions.
        _resetSubscriptions: function () {
            logger.debug(this.id + "._resetSubscriptions");
            // Release handles on previous object, if any.
            this._unsubscribe();

            // When a mendix object exists create subscribtions.
            var objectHandle = mx.data.subscribe({
                entity: this.messageEntity,
                callback: dojoLang.hitch(this, function (entity) {
                    this._fetchObjects();
                })
            });

            this._handles = [ objectHandle ];
        },

        // Fetch the messages from then given MF
        _fetchObjects: function(){
            logger.debug(this.id + "._fetchObjects");

            if (this.datasourceMf){
                this._execMF(this._contextObj, this.datasourceMf, dojoLang.hitch(this, this._prepareMessages));
            }
        },

        // Execute a given microflow with the provided parameter and callback
        _execMF: function (obj, mf, cb) {
            logger.debug(this.id + "._execMF", mf);
            if (mf) {
                var params = {
                    applyto: "selection",
                    actionname: mf,
                    guids: []
                };
                if (obj) {
                    params.guids = [obj.getGuid()];
                }
                logger.debug(this.id + "._execMF params:", params);
                mx.data.action({
                    store: {
                        caller: this.mxform
                    },
                    params: params,
                    callback: dojoLang.hitch(this, function (objs) {
                        logger.debug(this.id + "._execMF callback:", objs ? objs.length + " objects" : "null");
                        if (cb) {
                            cb(objs);
                        }
                    }),
                    error: function (error) {
                        if (cb) {
                            cb();
                        }
                        console.warn(error.description);
                    }
                }, this);

            } else if (cb) {
                cb();
            }
        },

        // Fetch the given list of messages by the datasource microflow
        _prepareMessages: function (objs) {
            logger.debug(this.id + "._prepareMessages");

            if (typeof objs === "undefined" || objs === "" || objs.length === 0) {
                return;
            }

            this._messageObjects = objs.slice();

            this._updateRendering();
        }
    });
});

require(["ChatWidget/widget/ChatWidget"]);
