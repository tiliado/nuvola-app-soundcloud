/*
 * Copyright 2014-2016 Jiří Janoušek <janousek.jiri@gmail.com>
 * Copyright 2015-2016 @kixam (https://github.com/kixam)
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

"use strict";

(function(Nuvola)
{
    // Create media player component
    var player = Nuvola.$object(Nuvola.MediaPlayer);

    // Handy aliases
    var PlaybackState = Nuvola.PlaybackState;
    var PlayerAction = Nuvola.PlayerAction;
    var C_ = Nuvola.Translate.pgettext;

    // Custom actions
    var ACTION_LIKE = "like";
    var ACTION_SHUFFLE = "shuffle";

    // Relevant buttons
    var _buttons = {
        // internal name : [identifying class, disabled/toggled class]
        "play": ["playControl", "playing"],
        "prev": ["skipControl__previous", "disabled"],
        "next": ["skipControl__next", "disabled"],
        "like": ["playbackSoundBadge__like", "sc-button-selected"],
        "shuffle": ["toggle", "sc-toggle-active"],
    };

    // Create new WebApp prototype
    var WebApp = Nuvola.$WebApp();

    // Initialization routines
    WebApp._onInitAppRunner = function(emitter)
    {
        Nuvola.WebApp._onInitAppRunner.call(this, emitter);

        Nuvola.actions.addAction("playback", "win", ACTION_LIKE, C_("Action", "Like"), null, null, null, false);
        Nuvola.actions.addAction("playback", "win", ACTION_SHUFFLE, C_("Action", "Shuffle"), null, null, null, false);
    }

    WebApp._onInitWebWorker = function(emitter)
    {
        Nuvola.WebApp._onInitWebWorker.call(this, emitter);

        var state = document.readyState;
        if (state === "interactive" || state === "complete")
            this._onPageReady();
        else
            document.addEventListener("DOMContentLoaded", this._onPageReady.bind(this));
    }

    // Page is ready for magic
    WebApp._onPageReady = function()
    {
        Nuvola.actions.connect("ActionActivated", this);
        player.addExtraActions([ACTION_LIKE, ACTION_SHUFFLE]);
        this.update();
    }

    // Extract data from the web page
    WebApp.update = function()
    {
        var track = {};
        // track title contains both artist and title names, try parsing one from the other using web-scrobbler filter
        try
        {
            var data = this._getSongData(document.getElementsByClassName("playbackSoundBadge__title")[0].title);
            track.artist = data[0];
            track.title = data[1];
        }
        catch (e)
        {
            track.title = null;
        }
        // track album is filled with SoundCloud playlist name
        try
        {
            track.album = document.getElementsByClassName("soundTitle__title g-type-shrinkwrap-inline")[0]
                                  .getElementsByTagName("SPAN")[0].innerText;
        }
        catch (e)
        {
            track.album = null;
        }
        // get SoundCloud playlist owner
        try
        {
            var owner = document.getElementsByClassName("soundTitle__usernameHero")[0].innerText;
            if(track.artist === null)
                track.artist = owner;
            else if (track.album !== null)
                track.album += " by " + owner;
        }
        catch (e)
        {
            data = null;
        }
        // get SoundCloud art location
        try
        {
          // if shown, prefer the 500x500px art
          var url = document.getElementsByClassName("listenArtworkWrapper__artwork")[0]
                            .getElementsByTagName("DIV")[0]
                            .getElementsByTagName("SPAN")[0].style.backgroundImage;
          track.artLocation = url.substr(4,url.length-5);
        }
        catch (e)
        {
          try
          {
            // else if shown, prefer the 200x200px art
            var url = document.getElementsByClassName("genericBadge m-playable m-playing")[0]
                              .getElementsByClassName("genericBadge__artwork")[0]
                              .getElementsByClassName("genericBadge__image")[0]
                              .getElementsByTagName("DIV")[0]
                              .getElementsByTagName("SPAN")[0].style.backgroundImage;
            track.artLocation = url.substr(4,url.length-5);
          }
          catch (e)
          {
            // else, fall back to the 50x50px art
            try
            {
              var url = document.getElementsByClassName("playbackSoundBadge__avatar")[0]
                                .getElementsByTagName("DIV")[0]
                                .getElementsByTagName("SPAN")[0].style.backgroundImage;
              track.artLocation = url.substr(4,url.length-5);
            }
            catch (e)
            {
              // no art found
              track.artLocation = null;
            }
          }
        }

        player.setTrack(track);

        var state = PlaybackState.UNKNOWN;
        if (this._isButtonEnabled("play"))
        {
            state = PlaybackState.PAUSED;
        }
        else if (this._getButton("play"))
        {
            state = PlaybackState.PLAYING;
        }
        player.setPlaybackState(state);
        player.setCanPlay(this._isButtonEnabled("play"));
        player.setCanPause(!this._isButtonEnabled("play"));
        player.setCanGoPrev(this._isButtonEnabled("prev"));
        player.setCanGoNext(this._isButtonEnabled("next"));
        var enabled = {};
        enabled[ACTION_LIKE] = !!this._getButton("like");
        enabled[ACTION_SHUFFLE] = !!this._getButton("shuffle");
        Nuvola.actions.updateEnabledFlags(enabled);
        var status = {};
        status[ACTION_LIKE] = !this._isButtonEnabled("like");
        status[ACTION_SHUFFLE] = !this._isButtonEnabled("shuffle");
        Nuvola.actions.updateStates(status);

        // Schedule the next update
        setTimeout(this.update.bind(this), 500);
    }

    WebApp._getButton = function(name)
    {
        return document.getElementsByClassName(_buttons[name][0])[0];
    }

    WebApp._isButtonEnabled = function(name)
    {
        var button = this._getButton(name);
        return button && !button.className.match(new RegExp('(\\s|^)'+_buttons[name][1]+'(\\s|$)'));
    }

    WebApp._clickButton = function(name)
    {
        var button = this._getButton(name);
        if (button)
        {
            Nuvola.clickOnElement(button);
            return true;
        }
        return false;
    }

    // Handler of playback actions
    WebApp._onActionActivated = function(emitter, name, param)
    {
        switch (name)
        {
            case PlayerAction.TOGGLE_PLAY:
            case PlayerAction.PLAY:
            case PlayerAction.PAUSE:
            case PlayerAction.STOP:
                this._clickButton("play");
                break;
            case PlayerAction.PREV_SONG:
                this._clickButton("prev");
                break;
            case PlayerAction.NEXT_SONG:
                this._clickButton("next");
                break;
            case ACTION_LIKE:
                this._clickButton("like");
                break;
            case ACTION_SHUFFLE:
                this._clickButton("shuffle");
                break;
            default:
                // Other commands are not supported
                throw {"message": "Action '" + name + "' not supported."};
        }
    }

    /*** { ***
     *** the following cleanup function is largely inspired from web-scrobbler
     *** SOURCE: https://github.com/david-sabata/web-scrobbler/blob/master/connectors/v2/soundcloud.js
     *** LICENSE: Copyright 2014 David Šabata <david.n.sabata@gmail.com>, see LICENSE-MIT.txt
     ***/

    WebApp._getSongData = function(track)
    {
        var artist,title;
        // Sometimes the artist name is in the track title.
        // e.g. Tokyo Rose - Zender Overdrive by Aphasia Records.
        /*jslint regexp: true*/
        var regex = /(.+)\s?[\-–:]\s?(.+)/,
            match = regex.exec(track);
        /*jslint regexp: false*/

        if (match)
        {
            artist = match[1].replace(/^\s+|\s+$/g, '');
            title = match[2];
        }
        else
        {
            artist = null;
            title = track;
        }

        /*jslint regexp: true*/
        // trim whitespace
        title = title.replace(/^\s+|\s+$/g, '');

        // Strip crap
        title = title.replace(/^\d+\.\s*/, ''); // 01.
        title = title.replace(/\s*\*+\s?\S+\s?\*+$/, ''); // **NEW**
        title = title.replace(/\s*\[[^\]]+\]$/, ''); // [whatever]
        title = title.replace(/\s*\([^\)]*version\)$/i, ''); // (whatever version)
        title = title.replace(/\s*\.(avi|wmv|mpg|mpeg|flv)$/i, ''); // video extensions
        title = title.replace(/\s*(of+icial\s*)?(music\s*)?video/i, ''); // (official)? (music)? video
        title = title.replace(/\s*\(\s*of+icial\s*\)/i, ''); // (official)
        title = title.replace(/\s*\(\s*[0-9]{4}\s*\)/i, ''); // (1999)
        title = title.replace(/\s+\(\s*(HD|HQ)\s*\)$/, ''); // HD (HQ)
        title = title.replace(/\s+(HD|HQ)\s*$/, ''); // HD (HQ)
        title = title.replace(/\s*video\s*clip/i, ''); // video clip
        title = title.replace(/\s+\(?live\)?$/i, ''); // live
        title = title.replace(/\(\s*\)/, ''); // Leftovers after e.g. (official video)
        title = title.replace(/^(|.*\s)"(.*)"(\s.*|)$/, '$2'); // Artist - The new "Track title" featuring someone
        title = title.replace(/^(|.*\s)'(.*)'(\s.*|)$/, '$2'); // 'Track title'
        title = title.replace(/^[\/\s,:;~\-]+/, ''); // trim starting white chars and dash
        title = title.replace(/[\/\s,:;~\-]+$/, ''); // trim trailing white chars and dash
        /*jslint regexp: false*/

        return [artist, title];
    }
    /*** } ***/

    WebApp.start();
})(this); // function(Nuvola)
