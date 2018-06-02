/*
 * Copyright 2014-2018 Jiří Janoušek <janousek.jiri@gmail.com>
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

'use strict';

(function (Nuvola) {
  var player = Nuvola.$object(Nuvola.MediaPlayer)

  var PlaybackState = Nuvola.PlaybackState
  var PlayerAction = Nuvola.PlayerAction
  var C_ = Nuvola.Translate.pgettext

  // Custom actions
  var ACTION_LIKE = 'like'
  var ACTION_SHUFFLE = 'shuffle'

  // Relevant buttons
  var _buttons = {
    // internal name : [identifying class, disabled/toggled class]
    'play': ['playControl', 'playing'],
    'prev': ['skipControl__previous', 'disabled'],
    'next': ['skipControl__next', 'disabled'],
    'like': ['playbackSoundBadge__like', 'sc-button-selected'],
    'shuffle': ['shuffleControl', 'disabled']
  }

  var WebApp = Nuvola.$WebApp()

  WebApp._onInitAppRunner = function (emitter) {
    Nuvola.WebApp._onInitAppRunner.call(this, emitter)
    Nuvola.actions.addAction('playback', 'win', ACTION_LIKE, C_('Action', 'Like'), null, null, null, false)
    Nuvola.actions.addAction('playback', 'win', ACTION_SHUFFLE, C_('Action', 'Shuffle'), null, null, null, false)
  }

  WebApp._onLastPageRequest = function (emitter, result) {
    Nuvola.WebApp._onLastPageRequest.call(this, emitter, result)
    if (result.url && result.url.indexOf('file://') === 0) {
      result.url = null
    }
  }

  WebApp._onInitWebWorker = function (emitter) {
    Nuvola.WebApp._onInitWebWorker.call(this, emitter)

    var state = document.readyState
    if (state === 'interactive' || state === 'complete') {
      this._onPageReady()
    } else {
      document.addEventListener('DOMContentLoaded', this._onPageReady.bind(this))
    }
  }

  WebApp._onPageReady = function () {
    Nuvola.actions.connect('ActionActivated', this)
    player.addExtraActions([ACTION_LIKE, ACTION_SHUFFLE])
    this.update()
  }

  WebApp.update = function () {
    var track = {title: null, artist: null, album: null}

    // track title contains both artist and title names, try parsing one from the other using web-scrobbler filter
    var elm = document.querySelector('.playbackSoundBadge__titleLink')
    if (!elm || !elm.title) {
      elm = document.querySelector('.playbackSoundBadge__title')
    }
    if (elm && elm.title) {
      var data = this._getSongData(elm.title)
      track.artist = data[0]
      track.title = data[1]
    }

    try {
      var albumArt = document.querySelector('.playbackSoundBadge__avatar span.sc-artwork').style.backgroundImage
      track.artLocation = albumArt.substr(5, albumArt.length - 7).replace('50x50.jpg', '500x500.jpg')
    } catch (e) {
      track.artLocation = null
    }

    track.length = this._timeTotal()
    player.setTrack(track)

    try {
      var timeElapsed = document.getElementsByClassName('playbackTimeline__timePassed')[0].childNodes[1].textContent
    } catch (e) {
      timeElapsed = null
    }
    player.setTrackPosition(timeElapsed || null)

    var state = PlaybackState.UNKNOWN
    if (this._isButtonEnabled('play')) {
      state = PlaybackState.PAUSED
    } else if (this._getButton('play')) {
      state = PlaybackState.PLAYING
    }
    player.setPlaybackState(state)
    player.setCanPlay(this._isButtonEnabled('play'))
    player.setCanPause(!this._isButtonEnabled('play'))
    player.setCanGoPrev(this._isButtonEnabled('prev'))
    player.setCanGoNext(this._isButtonEnabled('next'))
    player.setCanSeek(!!this._progressBar())
    player.setCanChangeVolume(!!this._volumeBar())
    player.updateVolume(Nuvola.queryAttribute('.volume__sliderWrapper', 'aria-valuenow'))
    var enabled = {}
    enabled[ACTION_LIKE] = !!this._getButton('like')
    enabled[ACTION_SHUFFLE] = !!this._getButton('shuffle')
    Nuvola.actions.updateEnabledFlags(enabled)
    var status = {}
    status[ACTION_LIKE] = !this._isButtonEnabled('like')
    status[ACTION_SHUFFLE] = !this._isButtonEnabled('shuffle')
    Nuvola.actions.updateStates(status)

    // Schedule the next update
    setTimeout(this.update.bind(this), 500)
  }

  WebApp._getButton = function (name) {
    return document.getElementsByClassName(_buttons[name][0])[0]
  }

  WebApp._isButtonEnabled = function (name) {
    var button = this._getButton(name)
    return button && !button.classList.contains(_buttons[name][1])
  }

  WebApp._clickButton = function (name) {
    var button = this._getButton(name)
    if (button) {
      Nuvola.clickOnElement(button)
      return true
    }
    return false
  }

  WebApp._timeTotal = function () {
    try {
      var timeTotal = document.getElementsByClassName('playbackTimeline__duration')[0].childNodes[1].textContent
    } catch (e) {
      timeTotal = null
    }
    return timeTotal || null
  }

  WebApp._progressBar = function () {
    return document.getElementsByClassName('playbackTimeline__progressBackground')[0] || null
  }

  WebApp._volumeBar = function () {
    var elm = document.querySelector('.playControls__volume div.volume')
    if (!elm) {
      return null
    }
    return [elm, elm.querySelector('.volume__sliderBackground')]
  }

  WebApp._onActionActivated = function (emitter, name, param) {
    switch (name) {
      case PlayerAction.TOGGLE_PLAY:
      case PlayerAction.PLAY:
      case PlayerAction.PAUSE:
      case PlayerAction.STOP:
        this._clickButton('play')
        break
      case PlayerAction.PREV_SONG:
        this._clickButton('prev')
        break
      case PlayerAction.NEXT_SONG:
        this._clickButton('next')
        break
      case ACTION_LIKE:
        this._clickButton('like')
        break
      case ACTION_SHUFFLE:
        this._clickButton('shuffle')
        break
      case PlayerAction.SEEK:
        var total = Nuvola.parseTimeUsec(this._timeTotal())
        if (param > 0 && param <= total) {
          Nuvola.clickOnElement(this._progressBar(), param / total, 0.5)
        }
        break
      case PlayerAction.CHANGE_VOLUME:
        var volume = this._volumeBar()
        volume[0].classList.add('expended')
        volume[0].classList.add('hover')
        Nuvola.clickOnElement(volume[1], 0.5, 1 - param)
        volume[0].classList.remove('expended')
        volume[0].classList.remove('hover')
        break
    }
  }

    /** * { ***
     *** the following cleanup function is largely inspired from web-scrobbler
     *** SOURCE: https://github.com/david-sabata/web-scrobbler/blob/master/connectors/v2/soundcloud.js
     *** LICENSE: Copyright 2014 David Šabata <david.n.sabata@gmail.com>, see LICENSE-MIT.txt
     ***/

  WebApp._getSongData = function (track) {
    var artist, title
    // Sometimes the artist name is in the track title.
    // e.g. Tokyo Rose - Zender Overdrive by Aphasia Records.
    /* jslint regexp: true */
    var regex = /(.+)\s?[-–:]\s?(.+)/
    var match = regex.exec(track)
    /* jslint regexp: false */

    if (match) {
      artist = match[1].replace(/^\s+|\s+$/g, '')
      title = match[2]
    } else {
      artist = null
      title = track
    }

    /* jslint regexp: true */
    // trim whitespace
    title = title.replace(/^\s+|\s+$/g, '')

        // Strip crap
    title = title.replace(/^\d+\.\s*/, '') // 01.
    title = title.replace(/\s*\*+\s?\S+\s?\*+$/, '') // **NEW**
    title = title.replace(/\s*\[[^\]]+\]$/, '') // [whatever]
    title = title.replace(/\s*\([^)]*version\)$/i, '') // (whatever version)
    title = title.replace(/\s*\.(avi|wmv|mpg|mpeg|flv)$/i, '') // video extensions
    title = title.replace(/\s*(of+icial\s*)?(music\s*)?video/i, '') // (official)? (music)? video
    title = title.replace(/\s*\(\s*of+icial\s*\)/i, '') // (official)
    title = title.replace(/\s*\(\s*[0-9]{4}\s*\)/i, '') // (1999)
    title = title.replace(/\s+\(\s*(HD|HQ)\s*\)$/, '') // HD (HQ)
    title = title.replace(/\s+(HD|HQ)\s*$/, '') // HD (HQ)
    title = title.replace(/\s*video\s*clip/i, '') // video clip
    title = title.replace(/\s+\(?live\)?$/i, '') // live
    title = title.replace(/\(\s*\)/, '') // Leftovers after e.g. (official video)
    title = title.replace(/^(|.*\s)"(.*)"(\s.*|)$/, '$2') // Artist - The new "Track title" featuring someone
    title = title.replace(/^(|.*\s)'(.*)'(\s.*|)$/, '$2') // 'Track title'
    title = title.replace(/^[/\s,:;~-]+/, '') // trim starting white chars and dash
    title = title.replace(/[/\s,:;~-]+$/, '') // trim trailing white chars and dash
    /* jslint regexp: false */

    return [artist, title]
  }
    /** * } ***/

  WebApp.start()
})(this) // function(Nuvola)
