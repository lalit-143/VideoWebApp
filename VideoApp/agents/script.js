const acceptButton = document.getElementById('acceptButton');
const declineButton = document.getElementById('declineButton');
const endCallButton = document.getElementById('endCallButton');
const landingPage = document.getElementById('landingPage');
const callPopup = document.getElementById('callPopup');
const callContainer = document.getElementById('callContainer');
const agentLocalVideo = document.getElementById('agentLocalVideo');
const visitorRemoteVideo = document.getElementById('visitorRemoteVideo');
const agentLocalVideoSmall = document.getElementById('agentLocalVideoSmall');
const callTimer = document.getElementById('callTimer');

const ringtone = new Audio('ringtone.mp3');
ringtone.loop = true;
let callInterval;
let localStream;
let pc = null;
let iceCandidatesQueue = [];

const drone = new ScaleDrone('yiS12Ts5RdNhebyM');
const roomName = 'observable-room';

drone.on('open', error => {
    if (error) return console.error('Agent: Error opening ScaleDrone connection:', error);
    const room = drone.subscribe(roomName);

    room.on('open', error => {
        if (error) return console.error('Agent: Error subscribing to room:', error);
    });

    room.on('data', (message, client) => {
        if (client && client.id !== drone.clientId) {
            if (message.sdp && message.sdp.type === 'offer') {
                console.log('Agent: Incoming offer received');
                ringtone.play();
                handleIncomingCall(message.sdp);
            } else if (message.candidate) {
                console.log('Agent: ICE candidate received');
                if (pc) {
                    pc.addIceCandidate(new RTCIceCandidate(message.candidate)).catch(error => {
                        console.error('Agent: Error adding ICE candidate:', error);
                    });
                } else {
                    console.log('Agent: Queuing ICE candidate');
                    iceCandidatesQueue.push(message.candidate);
                }
            } else if (message.endCall) {
                console.log('Agent: Call ended by visitor');
                endCall(true);
            }
        }
    });
});

function handleIncomingCall(offer) {
    showPopup();
    pc = createPeerConnection();
    pc.setRemoteDescription(new RTCSessionDescription(offer)).then(() => {
        iceCandidatesQueue.forEach(candidate => {
            pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(error => {
                console.error('Agent: Error adding queued ICE candidate:', error);
            });
        });
        iceCandidatesQueue = [];
    }).catch(error => {
        console.error('Agent: Error setting remote description:', error);
    });
}

acceptButton.addEventListener('click', () => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
        localStream = stream;
        agentLocalVideo.srcObject = stream;
        agentLocalVideoSmall.srcObject = stream;
        stream.getTracks().forEach(track => pc.addTrack(track, stream));
        createAnswer();
        hidePopup();
        ringtone.pause();
        ringtone.currentTime = 0;
    }).catch(error => {
        alert('Camera not detected. Please ensure your camera is connected and not in use by another application.');
        console.error('Agent: Error accessing media devices:', error);
    });
});

// Remaining functions...


declineButton.addEventListener('click', () => {
    ringtone.pause();
    ringtone.currentTime = 0;
    hidePopup();
    resetUI();
    stopCamera();
    sendMessage({ endCall: true });
    location.reload();
});

function createAnswer() {
    pc.createAnswer().then(answer => {
        pc.setLocalDescription(answer);
        sendMessage({ sdp: answer });
        startCallTimer();
        showCallInterface();
    }).catch(error => {
        console.error('Agent: Error creating answer:', error);
    });
}

function createPeerConnection() {
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
        ]
    };
    const pc = new RTCPeerConnection(configuration);

    pc.onicecandidate = event => {
        if (event.candidate) {
            console.log('Agent: ICE candidate generated');
            sendMessage({ candidate: event.candidate });
        }
    };

    pc.ontrack = event => {
        console.log('Agent: Remote track received');
        visitorRemoteVideo.srcObject = event.streams[0];
    };

    pc.onconnectionstatechange = () => {
        console.log(`Agent: Peer connection state changed to ${pc.connectionState}`);
        if (pc.connectionState === 'failed') {
            console.error('Agent: Peer connection failed');
            endCall(true);
        }
    };

    return pc;
}

function sendMessage(message) {
    drone.publish({
        room: roomName,
        message
    });
}

endCallButton.addEventListener('click', () => {
    endCall();
    sendMessage({ endCall: true });
});

function endCall(reloadPage = false) {
    ringtone.pause();
    ringtone.currentTime = 0;
    console.log('Agent: Ending call');
    stopCamera();
    if (pc) {
        pc.close();
        pc = null;
    }
    stopCallTimer();
    resetUI();
    if (reloadPage) {
        location.reload();
    }
}

function showPopup() {
    landingPage.style.display = 'none';
    callPopup.style.display = 'flex';
}

function hidePopup() {
    callPopup.style.display = 'none';
}

function showCallInterface() {
    callContainer.style.display = 'block';
}

function resetUI() {
    landingPage.style.display = 'flex';
    callContainer.style.display = 'none';
    visitorRemoteVideo.srcObject = null;
    agentLocalVideoSmall.srcObject = null;
    stopCallTimer();
}

function startCallTimer() {
    callStartTime = Date.now();
    callInterval = setInterval(() => {
        const elapsedTime = Math.floor((Date.now() - callStartTime) / 1000);
        const minutes = Math.floor(elapsedTime / 60);
        const seconds = elapsedTime % 60;
        callTimer.textContent = `Call Started - ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }, 1000);
}


function stopCallTimer() {
    if (callInterval) {
        clearInterval(callInterval);
        callInterval = null;
    }
    callTimer.textContent = '00:00';
}


function stopCamera() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
}
