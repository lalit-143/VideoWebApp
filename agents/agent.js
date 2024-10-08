const callModal = document.getElementById('callModal');
const modalText = document.getElementById('modalText');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const acceptCallButton = document.getElementById('acceptCallButton');
const declineCallButton = document.getElementById('declineCallButton');
const endCallButton = document.getElementById('endCallButton');

let mediaRecorder;
let mediaSource;
let sourceBuffer;
let socket;
let localStream;
let agentToVisitorStream; 
let visitorToAgentStream; 
let callActive = false;
let mediaSourceReady = false;
let pendingBuffers = [];

console.log('Checkpoint A1: Script loaded');

acceptCallButton.addEventListener('click', () => {
    acceptCall();
});

declineCallButton.addEventListener('click', () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({type: 'call_denied'}));
    }
    reloadPage();
});

endCallButton.addEventListener('click', endCall);

function initializeSocket() {
    console.log('Checkpoint A2: Initializing WebSocket');
    if (socket) {
        socket.close();
    }

    // socket = new WebSocket('ws://localhost:8080/agent');
    socket = new WebSocket('wss://one21videoapp.onrender.com/agent');

    socket.onopen = () => {
        console.log('Checkpoint A2.1: WebSocket connected');
    };

    socket.onmessage = handleMessage;
    socket.onclose = handleDisconnect;
}

initializeSocket();

function handleMessage(event) {
    if (event.data instanceof Blob) {
        console.log('Checkpoint A33: Received binary data, size:', event.data.size);
        event.data.arrayBuffer().then(buffer => {
            if (mediaSourceReady && mediaSource.readyState === 'open') {
                if (!sourceBuffer.updating) {
                    try {
                        sourceBuffer.appendBuffer(buffer);
                        console.log('Checkpoint A34: Appended buffer to SourceBuffer');
                    } catch (e) {
                        console.error('Checkpoint A35: Error appending buffer:', e);
                    }
                } else {
                    pendingBuffers.push(buffer);
                }
            } else {
                pendingBuffers.push(buffer);
            }
        });
    } else {
        console.log('Checkpoint A33: Received text message:', event.data);
        handleTextMessage(event.data);
    }
}

function handleTextMessage(message) {
    try {
        const parsedMessage = JSON.parse(message);
        console.log('Checkpoint A34: Parsed JSON message:', parsedMessage);

        if (parsedMessage.type === 'incoming_call') {
            console.log('Checkpoint A4: Incoming call');
            showIncomingCall();
        } else if (parsedMessage.type === 'call_accepted') {
            console.log('Checkpoint A5: Call accepted');
            callActive = true;
            modalText.textContent = 'Call Connected';
            acceptCallButton.style.display = 'none';
            declineCallButton.style.display = 'none';
            endCallButton.style.display = 'inline-block';
            startStreaming();
        } else if (parsedMessage.type === 'call_denied' || parsedMessage.type === 'call_ended') {
            console.log('Checkpoint A7: Call ended or denied');
            reloadPage();
        }
    } catch (error) {
        console.error('Checkpoint A35: Error parsing message:', error);
    }
}

function reloadPage() {
    console.log('Checkpoint A36: Reloading page');
    window.location.reload();
}

function showIncomingCall() {
    console.log('Checkpoint A8: Showing incoming call modal');
    callModal.style.display = 'block';
    remoteVideo.srcObject = null;
    remoteVideo.src = '';
    localVideo.srcObject = null;
    initializeLocalVideo();
    initializeAudio();
    initMediaSource();
}

function initializeLocalVideo() {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }) // Get audio as well
        .then(stream => {
            console.log('Checkpoint A9: Local media stream obtained');
            localStream = stream;
            localVideo.srcObject = stream;
        })
        .catch(error => {
            console.error('Checkpoint A10: Error accessing media devices:', error);
        });
}

function initializeAudio() {
    // Assuming you are using a HTML5 <audio> element for audio
    const audioElement = document.createElement('audio'); 
    audioElement.srcObject = localStream;
    audioElement.autoplay = true; 
    audioElement.muted = true; 
    // You can add audioElement to your DOM or manage it separately
    console.log('Checkpoint A11: Audio initialized');
}

function acceptCall() {
    console.log('Checkpoint A12: Accepting call');
    callActive = true;
    modalText.textContent = 'Call Connected';
    acceptCallButton.style.display = 'none';
    declineCallButton.style.display = 'none';
    endCallButton.style.display = 'inline-block';
    socket.send(JSON.stringify({ type: 'call_accepted' }));
    startStreaming();
}

function declineCall() {
    console.log('Checkpoint A13: Declining call');
    socket.send(JSON.stringify({type: 'call_denied'}));
    endCall();
}

function initMediaSource() {
    console.log('Checkpoint A14: Initializing MediaSource');
    if (mediaSource) {
        if (mediaSource.readyState === 'open') {
            mediaSource.endOfStream();
        }
        mediaSource = null;
    }
    mediaSource = new MediaSource();
    remoteVideo.src = URL.createObjectURL(mediaSource);

    mediaSource.addEventListener('sourceopen', () => {
        console.log('Checkpoint A15: MediaSource opened');
        if (sourceBuffer) {
            mediaSource.removeSourceBuffer(sourceBuffer);
        }
        sourceBuffer = mediaSource.addSourceBuffer('video/webm; codecs="vp8,opus"');
        sourceBuffer.mode = 'segments';
        mediaSourceReady = true;
        sourceBuffer.addEventListener('updateend', () => {
            console.log('Checkpoint A16: SourceBuffer updated');
            if (pendingBuffers.length > 0 && !sourceBuffer.updating) {
                sourceBuffer.appendBuffer(pendingBuffers.shift());
            }
        });
        processPendingBuffers();
    });
}

function processPendingBuffers() {
    if (mediaSourceReady && mediaSource.readyState === 'open' && !sourceBuffer.updating) {
        if (pendingBuffers.length > 0) {
            try {
                sourceBuffer.appendBuffer(pendingBuffers.shift());
            } catch (e) {
                console.error('Checkpoint A38: Error appending pending buffer:', e);
            }
        }
    }
}

function startStreaming() {
    console.log('Checkpoint A17: Start streaming');
    if (localStream) {
        mediaRecorder = new MediaRecorder(
            localStream, { 
            mimeType: 'video/webm; codecs=vp8,opus',
            videoBitsPerSecond: 250000,
            audioBitsPerSecond: 64000
        });

        mediaRecorder.ondataavailable = event => {
            if (event.data.size > 0 && socket.readyState === WebSocket.OPEN && callActive) {
                console.log('Checkpoint A18: Sending video data, size:', event.data.size);
                socket.send(event.data);
            }
        };

        mediaRecorder.start(500); // Increase chunk size to 1 second 1000
    } else {
        console.error('Checkpoint A19: Local stream not available');
    }
}

function startRemoteStreaming() {
    console.log('Checkpoint A21: Start receiving visitor video');
    const remoteStreamWs = new WebSocket('ws://localhost:8080/visitor/stream');

    remoteStreamWs.onopen = () => {
        console.log('Checkpoint A22: Visitor stream WebSocket connected');
        mediaSource = new MediaSource();
        remoteVideo.src = URL.createObjectURL(mediaSource);

        mediaSource.addEventListener('sourceopen', () => {
            console.log('Checkpoint A22.1: MediaSource opened');
            sourceBuffer = mediaSource.addSourceBuffer('video/webm; codecs="vp8,opus"');
            sourceBuffer.mode = 'segments';
        });

        remoteStreamWs.onmessage = (event) => {
            console.log('Checkpoint A23: Received visitor video data, size:', event.data.size);
            if (mediaSource.readyState === 'open' && sourceBuffer && !sourceBuffer.updating) {
                try {
                    sourceBuffer.appendBuffer(event.data);
                    console.log('Checkpoint A24: Appended buffer to SourceBuffer');
                } catch (e) {
                    console.error('Checkpoint A25: Error appending buffer:', e);
                }
            } else {
                console.log('Checkpoint A26: Unable to append buffer. MediaSource state:', mediaSource.readyState);
            }
        };
    };

    remoteStreamWs.onclose = () => {
        console.log('Checkpoint A28: Visitor stream WebSocket closed');
    };
}

function handleDisconnect() {
    console.log('Checkpoint A28: WebSocket closed. Call ended.');
    endCall();
}

function endCall() {
    console.log('Checkpoint A29: Ending call');
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({type: 'call_ended'}));
    }
    reloadPage();
}

remoteVideo.addEventListener('loadedmetadata', () => {
    console.log('Checkpoint A30: Remote video metadata loaded');
});

remoteVideo.addEventListener('play', () => {
    console.log('Checkpoint A31: Remote video started playing');
});

remoteVideo.addEventListener('error', (e) => {
    console.error('Checkpoint A32: Remote video error:', e);
});