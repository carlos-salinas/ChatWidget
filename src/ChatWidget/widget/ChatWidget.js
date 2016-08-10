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
    "dojo/dom",
    "dojo/dom-prop",
    "dojo/dom-geometry",
    "dojo/dom-class",
    "dojo/dom-style",
    "dojo/dom-construct",
    "dojo/_base/array",
    "dojo/_base/lang",
    "dojo/text",
    "dojo/html",
    "dojo/_base/event",

    "ChatWidget/lib/jquery-1.11.2",
    "dojo/text!ChatWidget/widget/template/ChatWidget.html"
], function (declare, _WidgetBase, _TemplatedMixin, dom, dojoDom, dojoProp, dojoGeometry, dojoClass, dojoStyle, dojoConstruct, dojoArray, dojoLang, dojoText, dojoHtml, dojoEvent, _jQuery, widgetTemplate) {
    "use strict";

    var $ = _jQuery.noConflict(true);

    // Declare widget's prototype.
    return declare("ChatWidget.widget.ChatWidget", [ _WidgetBase, _TemplatedMixin ], {
        // _TemplatedMixin will create our dom node using this HTML template.
        templateString: widgetTemplate,

        // DOM elements
        chatListnode: null,
        sendMessageInputNode: null,
        sendMessageButtonNode: null,

        // Parameters configured in the Modeler.
        messageEntity: null,
        datasourceMf: null,
        mfToSendMessage: "",

        // Internal variables. Non-primitives created in the prototype are shared between all widget instances.
        _handles: null,
        _contextObj: null,
        _alertDiv: null,
        _readOnly: false,
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

                        // If a microflow has been set execute the microflow on a click.
                        if (this.mfToSendMessage !== "") {
                            mx.data.action({
                                params: {
                                    applyto: "selection",
                                    actionname: this.mfToSendMessage,
                                    guids: [ messageObject.getGuid() ]
                                },
                                callback: function (obj) {
                                    //TODO what to do when all is ok!
                                },
                                error: dojoLang.hitch(this, function (error) {
                                    logger.error(this.id + ": An error occurred while executing microflow: " + error.description);
                                })
                            }, this);
                        }
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
            dojoConstruct.place(messageNode, this.chatListnode, "first");
        },
        _createMessageNode: function(obj, index){
            logger.debug(this.id + "._createMessageNode");

            var messageLiClass = "";
            var messageSpanClass = "";
            var messageUserImgSrc = "";
            var messageHeaderDivNode = dojoConstruct.create("div", {"class": "header"});
            var messageChatbodyTextPNode = null;

            if (index % 2 == 0){
                messageLiClass = "right clearfix";
                messageSpanClass = "chat-img pull-right";
                messageUserImgSrc = "http://placehold.it/50/FA6F57/fff&text=ME";

                dojoConstruct.create("small", {"class": "text-muted", "innerHTML": "<span class=\"glyphicon glyphicon-time\"></span>12 mins ago"}, messageHeaderDivNode);
                dojoConstruct.create("strong", {"class": "pull-right  primary-font", "innerHTML": obj.get("Author")}, messageHeaderDivNode);
                messageChatbodyTextPNode = dojoConstruct.create("p", {"class": "text-right", "innerHTML": obj.get("Message")});
            }
            else {
                messageLiClass = "left clearfix";
                messageSpanClass = "chat-img pull-left";
                messageUserImgSrc = "http://placehold.it/50/55C1E7/fff&text=U";

                dojoConstruct.create("strong", {"class": "primary-font", "innerHTML": obj.get("Author")}, messageHeaderDivNode);
                dojoConstruct.create("small", {"class": "pull-right text-muted", "innerHTML": "<span class=\"glyphicon glyphicon-time\"></span>12 mins ago"}, messageHeaderDivNode);
                messageChatbodyTextPNode = dojoConstruct.create("p", {"innerHTML": obj.get("Message")});
            }

            var messageLiNode = dojoConstruct.create("li", {"class": messageLiClass});
             dojoConstruct.create("span", {"class": messageSpanClass, "innerHTML": "<img src=\"" + messageUserImgSrc + "\" alt=\"User Avatar\" class=\"img-circle\" />"}, messageLiNode);

            var messageChatbodyDivNode =  dojoConstruct.create("div", {"class": "chat-body clearfix"}, null, messageLiNode);

            dojoConstruct.place(messageChatbodyDivNode, messageLiNode, "last");
            dojoConstruct.place(messageHeaderDivNode, messageChatbodyDivNode, "last");
            dojoConstruct.place(messageChatbodyTextPNode, messageChatbodyDivNode, "last");

            return messageLiNode;
        },
        // Handle validations.
        _handleValidation: function (validations) {
            logger.debug(this.id + "._handleValidation");
            this._clearValidations();

            if (this._readOnly) {

            } else if (message) {
                this._addValidation(message);
            }
        },

        // Clear validations.
        _clearValidations: function () {
            logger.debug(this.id + "._clearValidations");
            dojoConstruct.destroy(this._alertDiv);
            this._alertDiv = null;
        },

        // Show an error message.
        _showError: function (message) {
            logger.debug(this.id + "._showError");
            if (this._alertDiv !== null) {
                dojoHtml.set(this._alertDiv, message);
                return true;
            }
            this._alertDiv = dojoConstruct.create("div", {
                "class": "alert alert-danger",
                "innerHTML": message
            });
            dojoConstruct.place(this._alertDiv, this.domNode);
        },

        // Add a validation.
        _addValidation: function (message) {
            logger.debug(this.id + "._addValidation");
            this._showError(message);
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
                this._execMF(null, this.datasourceMf, dojoLang.hitch(this, this._prepareMessages));
            }
        },
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
