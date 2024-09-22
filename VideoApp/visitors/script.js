const callButton = document.getElementById('callButton');
const endCallButton = document.getElementById('endCallButton');
const popupTitle = document.getElementById('popupTitle');
const callPopup = document.getElementById('callPopup');
const mainPage = document.getElementById('mainPage');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

let localStream;
let pc;
let isCalling = false;
let callStartTime;
let callInterval;

const drone = new ScaleDrone('yiS12Ts5RdNhebyM');
const roomName = 'observable-room';

drone.on('open', error => {
    if (error) return console.error('Visitor: Error opening ScaleDrone connection:', error);
    const room = drone.subscribe(roomName);
    room.on('open', error => {
        if (error) return console.error('Visitor: Error subscribing to room:', error);
    });
    room.on('data', (message, client) => {
        if (client && client.id !== drone.clientId) {
            if (message.sdp) {
                pc.setRemoteDescription(new RTCSessionDescription(message.sdp)).then(() => {
                    if (pc.remoteDescription.type === 'answer') {
                        console.log('Visitor: Call accepted by agent');
                        endCallButton.style.display = 'block';
                        remoteVideo.style.display = 'block';
                        localVideo.style.display = 'block';
                        localVideo.style.animation = 'moveToCorner 1s ease-in-out forwards';
                        popupTitle.textContent = 'Call Started';
                        stopCallTimer();
                        startCallTimer();
                    }
                }).catch(error => {
                    console.error('Visitor: Error setting remote description:', error);
                });
            } else if (message.candidate) {
                pc.addIceCandidate(new RTCIceCandidate(message.candidate)).catch(error => {
                    console.error('Visitor: Error adding ICE candidate:', error);
                });
            } else if (message.endCall) {
                console.log('Visitor: Call ended by agent');
                endCall();
            }
        }
    });
});

callButton.addEventListener('click', () => {
    if (!isCalling) {
        isCalling = true;
        mainPage.style.display = 'none';
        callPopup.style.display = 'flex';
        popupTitle.textContent = 'Connecting Agent...';
        startCall();
    }
});

function startCall() {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
        localStream = stream;
        localVideo.srcObject = stream;
        pc = createPeerConnection();
        stream.getTracks().forEach(track => pc.addTrack(track, stream));
        createOffer();
    }).catch(error => {
        alert('Camera not detected. Please ensure your camera is connected and not in use by another application.');
        console.error('Visitor: Error accessing media devices:', error);
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
            console.log('Visitor: ICE candidate generated');
            sendMessage({ candidate: event.candidate });
        }
    };

    pc.ontrack = event => {
        remoteVideo.srcObject = event.streams[0];
        console.log('Visitor: Remote track received');
    };

    pc.onconnectionstatechange = () => {
        console.log(`Visitor: Peer connection state changed to ${pc.connectionState}`);
        if (pc.connectionState === 'failed') {
            console.error('Visitor: Peer connection failed');
            endCall(true);
        }
    };

    return pc;
}

function createOffer() {
    pc.createOffer().then(offer => {
        return pc.setLocalDescription(offer).then(() => {
            sendMessage({ sdp: offer });
            console.log('Visitor: Calling Agent');
        });
    }).catch(error => {
        console.error('Visitor: Error creating offer:', error);
    });
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

function endCall() {
    if (pc) {
        pc.close();
        pc = null;
    }
    stopCallTimer();
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    localVideo.style.animation = '';
    localVideo.style.display = 'none';
    remoteVideo.style.display = 'none';
    callPopup.style.display = 'none';
    mainPage.style.display = 'flex';
    endCallButton.style.display = 'none';
    isCalling = false;
    window.location.reload();
}

function startCallTimer() {
    callStartTime = Date.now();
    callInterval = setInterval(() => {
        const elapsedTime = Math.floor((Date.now() - callStartTime) / 1000);
        const minutes = Math.floor(elapsedTime / 60);
        const seconds = elapsedTime % 60;
        popupTitle.textContent = `Call Started - ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }, 1000);
}

function stopCallTimer() {
    clearInterval(callInterval);
}
