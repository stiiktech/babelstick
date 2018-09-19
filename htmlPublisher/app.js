
var loc = window.location, ws_uri;
if (loc.protocol === "https:") {
	ws_uri = "wss:";
} else {
	ws_uri = "ws:";
}
ws_uri += "//" + loc.host;
var path = loc.pathname.replace(/\/$/, '');
ws_uri += "/ws";

var ws = new WebSocket(ws_uri);

var pc;

var localStream;
var audioTrack;

$(function(){

	var debug = (...m) => {
		console.log(...m)
	}
	var log = (...m) => {
		console.log(...m)
		// strip html
		var a = $("<div />").text(m.join(", ")).html();
		$("#status .log").prepend("<div class='message'>" + a + '</div>');
	}
	var msg = m => {
		var d = new Date(Date.now()).toLocaleString();
		// strip html
		var a = $("<div />").text(m.Message).html();
		$("#messages").prepend("<div class='message'><span class='time'>" + d + "</span><span class='sender'>" + m.Sender + "</span><span class='message'>" + a + "</span></div>");
	}

	var wsSend = m => {
		if (ws.readyState === 1) {
			ws.send(JSON.stringify(m));
		} else {
			debug("WS send not ready, delaying...")
			setTimeout(function() {
				ws.send(JSON.stringify(m));
			}, 2000);
		}
	}

	$("#reload").click(() => window.location.reload(false) );

	$(".opener").click(function() {
		$(this).find(".opener-arrow").toggleClass("icon-down-open icon-right-open")
		$(this).siblings(".log").slideToggle()
	});

	$("#microphone").click(function() {
		toggleMic()
	});

	var toggleMic = function() {
		$el = $("#microphone")
		$el.toggleClass("icon-mute icon-mic on")
		audioTrack.enabled = $el.hasClass("icon-mic")
	}

	$("#input-form").submit(e => {
		e.preventDefault();

		$("#output").show();
		$("#input-form").hide();
		var params = {};
		params.Channel = $("#channel").val();
		params.Password = $("#password").val();
		var val = {Key: 'connect_publisher', Value: params};
		wsSend(val)
	});

	ws.onopen = function() {
		debug("WS connection open")
	};

	ws.onmessage = function (e)	{
		var wsMsg = JSON.parse(e.data);
		if( 'Key' in wsMsg ) {
			switch (wsMsg.Key) {
				case 'info':
					debug("server info", wsMsg.Value);
					break;
				case 'error':
					log("server error", wsMsg.Value);
					break;
				case 'sd_answer':
					startSession(wsMsg.Value);
					break;
			}
		}
	};

	ws.onclose = function()	{
		log("WS connection closed");
		if (audioTrack) {
			audioTrack.stop()
		}
		pc.close()
	};


	//
	// -------- WebRTC ------------
	//

	let pc = new RTCPeerConnection({
		iceServers: [
			{
				urls: 'stun:stun.l.google.com:19302'
			}
		]
	})

	const constraints = window.constraints = {
		audio: true,
		video: false
	};

	try {
		window.AudioContext = window.AudioContext || window.webkitAudioContext;
		window.audioContext = new AudioContext();
	} catch (e) {
		alert('Web Audio API not supported.');
	}

	const signalMeter = document.querySelector('#microphone-meter meter');

	navigator.mediaDevices.getUserMedia(constraints)
		.then(stream => {
			localStream = stream

			audioTrack = stream.getAudioTracks()[0];
			pc.addStream(stream)
			// mute until we're ready
			audioTrack.enabled = false;

			const soundMeter = new SoundMeter(window.audioContext);
			soundMeter.connectToSource(stream, function(e) {
				if (e) {
					alert(e);
					return;
				}

				// make the meter value relative to a sliding max
				var max = 0.0
				setInterval(() => {
					var val = soundMeter.instant.toFixed(2)
					if( val > max ) { max = val }
					if( max > 0) { val = (val / max) }
					signalMeter.value = val
				}, 50);
			});
		})
		.catch(log)

	pc.oniceconnectionstatechange = e => {
		debug("ICE state:", pc.iceConnectionState)
		switch (pc.iceConnectionState) {
			case "new":
			case "checking":
			case "failed":
			case "disconnected":
			case "closed":
			case "completed":
				break
			case "connected":
				$("#spinner").hide()
				$("#connect-button").show()
				break
			default:
				debug("ice state unknown", e)
				break
		}
	}

	pc.onicecandidate = event => {
		$("#spinner").show()
		if (event.candidate === null) {
			var params = {};
			params.SessionDescription = pc.localDescription.sdp
			var val = {Key: 'session', Value: params};
			wsSend(val)
		}
	}

	pc.onnegotiationneeded = e =>
		pc.createOffer().then(d => pc.setLocalDescription(d)).catch(log)

	startSession = (sd) => {
		try {
			pc.setRemoteDescription(new RTCSessionDescription({type: 'answer', sdp: sd}))
		} catch (e) {
			alert(e)
		}
	}

});
