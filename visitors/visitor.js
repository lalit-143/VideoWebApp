const callButton = document.getElementById('callButton');
const callModal = document.getElementById('callModal');
const modalText = document.getElementById('modalText');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const endCallButton = document.getElementById('endCallButton');

let mediaRecorder;
let mediaSource;
let sourceBuffer;
let mediaSourceReady = false;
let pendingBuffers = [];
let socket;
let localStream;
let visitorToAgentStream;
let callActive = false;

console.log('Checkpoint V1: Script loaded');

callButton.addEventListener('click', startCall);
endCallButton.addEventListener('click', endCall);

function startCall() {
    console.log('Checkpoint V2: Start call initiated');
    callModal.style.display = 'block';
    localVideo.style.display = 'block';

    // socket = new WebSocket('ws://localhost:8080/visitor');
    socket = new WebSocket('wss://one21videoapp.onrender.com/visitor');

    socket.onopen = () => {
        console.log('Checkpoint V3: WebSocket connected');
        initializeLocalVideo();
        initializeAudio();
        initMediaSource();
    };

    socket.onmessage = handleMessage;
    socket.onclose = handleDisconnect;
}

function initializeLocalVideo() {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }) // Get audio as well
        .then(stream => {
            console.log('Checkpoint V4: Local media stream obtained');
            localStream = stream;
            localVideo.srcObject = stream;
        })
        .catch(error => {
            console.error('Checkpoint V5: Error accessing media devices:', error);
        });
}

function initializeAudio() {
    // Assuming you are using a HTML5 <audio> element for audio
    const audioElement = document.createElement('audio'); 
    audioElement.srcObject = localStream;
    audioElement.autoplay = true; 
    audioElement.muted = true; 
    // You can add audioElement to your DOM or manage it separately
    console.log('Checkpoint V6: Audio initialized');
}

function initMediaSource() {
    console.log('Checkpoint V11: Initializing MediaSource');
    mediaSource = new MediaSource();
    remoteVideo.src = URL.createObjectURL(mediaSource);

    mediaSource.addEventListener('sourceopen', () => {
        console.log('Checkpoint V12: MediaSource opened');
        sourceBuffer = mediaSource.addSourceBuffer('video/webm; codecs="vp8,opus"');
        sourceBuffer.mode = 'segments';
        mediaSourceReady = true;
        sourceBuffer.addEventListener('updateend', () => {
            console.log('Checkpoint V13: SourceBuffer updated');
            if (pendingBuffers.length > 0 && !sourceBuffer.updating) {
                sourceBuffer.appendBuffer(pendingBuffers.shift());
            }
        });
        processPendingBuffers();
    });
}

function handleMessage(event) {
    if (event.data instanceof Blob) {
        console.log('Checkpoint V30: Received binary data, size:', event.data.size);
        console.log('Checkpoint V30.1: Data type:', event.data.type);
        
        // Check if the received data is actually video data
        if (event.data.size < 100) {
            console.log('Checkpoint V30.2: Received data is too small to be video, treating as text');
            event.data.text().then(text => {
                console.log('Checkpoint V30.3: Text content:', text);
                handleTextMessage(text);
            });
            return;
        }

        event.data.arrayBuffer().then(buffer => {
            console.log('Checkpoint V30.4: ArrayBuffer size:', buffer.byteLength);
            if (mediaSourceReady && mediaSource.readyState === 'open') {
                if (!sourceBuffer.updating) {
                    try {
                        sourceBuffer.appendBuffer(buffer);
                        console.log('Checkpoint V31: Appended buffer to SourceBuffer');
                    } catch (e) {
                        console.error('Checkpoint V32: Error appending buffer:', e);
                    }
                } else {
                    console.log('Checkpoint V33: SourceBuffer updating, added to pending buffers');
                    pendingBuffers.push(buffer);
                }
            } else {
                console.log('Checkpoint V34: MediaSource not ready, added to pending buffers');
                pendingBuffers.push(buffer);
            }
        });
    } else {
        console.log('Checkpoint V35: Received text message:', event.data);
        handleTextMessage(event.data);
    }
}

function handleTextMessage(message) {
    try {
        const parsedMessage = JSON.parse(message);
        console.log('Checkpoint V36: Parsed JSON message:', parsedMessage);
        
        if (parsedMessage.type === 'call_accepted') {
            console.log('Checkpoint V8: Call accepted by agent');
            callActive = true;
            modalText.textContent = 'Call Connected';
            endCallButton.style.display = 'inline-block';
            startStreaming();
        } else if (parsedMessage.type === 'call_denied') {
            console.log('Checkpoint V9: Call denied by agent');
            reloadPage();
        } else if (parsedMessage.type === 'call_ended') {
            console.log('Checkpoint V10: Call ended');
            reloadPage();
        }
    } catch (error) {
        console.error('Checkpoint V37: Error parsing message:', error);
    }
}

function reloadPage() {
    console.log('Checkpoint V38: Reloading page');
    window.location.reload();
}

function processPendingBuffers() {
    if (mediaSourceReady && mediaSource.readyState === 'open' && !sourceBuffer.updating) {
        if (pendingBuffers.length > 0) {
            try {
                sourceBuffer.appendBuffer(pendingBuffers.shift());
            } catch (e) {
                console.error('Checkpoint V35: Error appending pending buffer:', e);
            }
        }
    }
}

function startStreaming() {
    console.log('Checkpoint V14: Start streaming');
    if (localStream) {
        mediaRecorder = new MediaRecorder(
            localStream, { mimeType: 'video/webm; codecs=vp8,opus' }
        );

        mediaRecorder.ondataavailable = event => {
            if (event.data.size > 0 && socket.readyState === WebSocket.OPEN && callActive) {
                socket.send(event.data);
                console.log('Checkpoint V15: Sent video data, size:', event.data.size);
            }
        };

        mediaRecorder.start(100);
    } else {
        console.error('Checkpoint V16: Local stream not available');
    }
}

function startRemoteStreaming() {
    console.log('Checkpoint V18: Start receiving agent video');
    const remoteStreamWs = new WebSocket('ws://localhost:8080/agent/stream');

    remoteStreamWs.onopen = () => {
        console.log('Checkpoint V19: Agent stream WebSocket connected');
        mediaSource = new MediaSource();
        remoteVideo.src = URL.createObjectURL(mediaSource);

        mediaSource.addEventListener('sourceopen', () => {
            console.log('Checkpoint V19.1: MediaSource opened');
            sourceBuffer = mediaSource.addSourceBuffer('video/webm; codecs="vp8,opus"');
            sourceBuffer.mode = 'segments';
        });

        remoteStreamWs.onmessage = (event) => {
            console.log('Checkpoint V20: Received agent video data, size:', event.data.size);
            if (mediaSource.readyState === 'open' && sourceBuffer && !sourceBuffer.updating) {
                try {
                    sourceBuffer.appendBuffer(event.data);
                    console.log('Checkpoint V21: Appended buffer to SourceBuffer');
                } catch (e) {
                    console.error('Checkpoint V22: Error appending buffer:', e);
                }
            } else {
                console.log('Checkpoint V23: Unable to append buffer. MediaSource state:', mediaSource.readyState);
            }
        };
    };

    remoteStreamWs.onclose = () => {
        console.log('Checkpoint V24: Agent stream WebSocket closed');
    };
}

function handleDisconnect() {
    console.log('Checkpoint V25: WebSocket closed. Call ended.');
    endCall();
}

function endCall() {
    console.log('Checkpoint V26: Ending call');
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({type: 'call_ended'}));
    }
    reloadPage();
}

remoteVideo.addEventListener('loadedmetadata', () => {
    console.log('Checkpoint V27: Remote video metadata loaded');
});

remoteVideo.addEventListener('play', () => {
    console.log('Checkpoint V28: Remote video started playing');
});

remoteVideo.addEventListener('error', (e) => {
    console.error('Checkpoint V29: Remote video error:', e);
    console.error('Error code:', remoteVideo.error.code);
    console.error('Error message:', remoteVideo.error.message);
});