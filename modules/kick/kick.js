var _ = require('underscore')._;

var kick = function(dbot) {   
    this.api = {
        'ban': function(server, host, channel) {
            dbot.instance.connections[server].send('MODE ' + channel + ' +b *!*@' + host);
        },

        'quiet': function(server, host, channel) {
            dbot.instance.connections[server].send('MODE ' + channel + ' +q *!*@' + host);
        },

        'unquiet': function(server, host, channel) {
            dbot.instance.connections[server].send('MODE ' + channel + ' -q *!*@' + host);
        },

        'devoice': function(server, nick, channel) {
            dbot.instance.connections[server].send('MODE ' + channel + ' -v ' +nick);
        },

        'voice': function(server, nick, channel) {
            dbot.instance.connections[server].send('MODE ' + channel + ' +v ' +nick);
        },

        'kick': function(server, user, channel, msg) {
            dbot.instance.connections[server].send('KICK ' + channel + ' ' + user + ' :' + msg);
        },

        'unban': function(server, host, channel) {
            // TODO: Wrest control from chanserv
            //dbot.say(server, this.config.chanserv, 'unban ' + channel + ' *!*@' + host);
            dbot.instance.connections[server].send('MODE ' + channel + ' -b *!*@' + host);
        },

        'networkUnban': function(server, unbanee, unbanner, callback) {
            var channels = dbot.config.servers[server].channels,
                network = this.config.network_name[server] || server,
                adminChannel = dbot.config.servers[server].admin_channel;

            if(_.has(this.hosts, server) && _.has(this.hosts[server], unbanee)) {
                var host = this.hosts[server][unbanee];

                // Notify Staff
                if(_.isUndefined(adminChannel)) {
                    adminChannel = event.channel.name;
                }

                var notifyString = dbot.t('nunbanned', {
                    'network': network,
                    'unbanee': unbanee,
                    'unbanner': unbanner.currentNick
                });
                dbot.api.report.notify('unban', server, unbanner, adminChannel, notifyString);
                dbot.say(server, adminChannel, notifyString);

                // Notify Unbanee
                dbot.say(server, unbanee, dbot.t('nunban_notify', {
                    'network': network,
                    'unbanee': unbanee,
                    'unbanner': unbanner.currentNick
                }));

                // Unban
                var i = 0;
                var unbanChannel = function(channels) {
                    if(i >= channels.length) return;
                    var channel = channels[i];
                    this.api.unban(server, host, channel);
                    setTimeout(function() {
                        i++; unbanChannel(channels);
                    }, 1000);
                }.bind(this);
                unbanChannel(channels);

                dbot.say(server, 'NickServ', 'FREEZE ' + unbanee + ' OFF');
                callback(null); // Success
            } else {
                // Attempt to look up the host on-the-fly
                dbot.api.nickserv.getUserHost(server, unbanee, unbanner, function(host) {
                    if(host) {
                        if(!_.has(this.hosts, server)) this.hosts[server] = {};
                        this.hosts[server][unbanee] = host;
                        this.api.networkUnban(server, unbanee, unbanner);
                    } else {
                        callback(true); // No host could be found
                    }
                }.bind(this));
            }
        }
    };

    this.internalAPI = {
        'addTempBan': function(server, banee, timeout) {
            dbot.api.timers.addTimeout(timeout, function() {
                this.api.networkUnban(server, banee, dbot.config.name, function(err) {});
                delete this.tempBans[server][banee];
            }.bind(this));  
        }.bind(this)
    };
    
    this.listener = function(event) {
       if(event.kickee == dbot.config.name) {
            dbot.instance.join(event, event.channel.name);
            event.reply(dbot.t('kicked_dbot', { 'botname': dbot.config.name }));
            dbot.db.kicks[dbot.config.name] += 1;
        } else {
            if(!_.has(dbot.db.kicks, event.kickee)) {
                dbot.db.kicks[event.kickee] = 1;
            } else {
                dbot.db.kicks[event.kickee] += 1;
            }

            if(!_.has(dbot.db.kickers, event.user)) {
                dbot.db.kickers[event.user] = 1; 
            } else {
                dbot.db.kickers[event.user] += 1;
            }

            if(!this.config.countSilently) {
                event.reply(event.kickee + '-- (' + dbot.t('user_kicks', {
                    'user': event.kickee, 
                    'kicks': dbot.db.kicks[event.kickee], 
                    'kicked': dbot.db.kickers[event.kickee]
                }) + ')');
            }
        }
    }.bind(this);
    this.on = 'KICK';

    this.onLoad = function() {
        _.each(this.tempBans, function(bans, server) {
            _.each(bans, function(timeout, nick) {
                timeout = new Date(timeout);
                this.internalAPI.addTempBan(server, nick, timeout); 
            }, this);
        }, this);

        if(_.has(dbot.modules, 'web')) {
            dbot.api.web.addIndexLink('/bans', 'Ban List');
        }

        if(!_.has(dbot.db, 'hosts')) {
            dbot.db.hosts = {};
            _.each(dbot.config.servers, function(v, k) {
                dbot.db.hosts[k] = {};
            }, this);
        }
        if(!_.has(dbot.db, 'tempBans')) dbot.db.tempBans = {};
        this.hosts = dbot.db.hosts;
        this.tempBans = dbot.db.tempBans;
    }.bind(this);
};

exports.fetch = function(dbot) {
    return new kick(dbot);
};
