const {
    default: makeWASocket,
	MessageType, 
    MessageOptions, 
    Mimetype,
	DisconnectReason,
	BufferJSON,
    AnyMessageContent, 
	delay, 
	fetchLatestBaileysVersion, 
	isJidBroadcast, 
	makeCacheableSignalKeyStore, 
	makeInMemoryStore, 
	MessageRetryMap, 
	useMultiFileAuthState,
	msgRetryCounterMap
} =require("@adiwajshing/baileys");

const log = (pino = require("pino"));
const { session } = {"session": "baileys_auth_info"};
const { Boom } =require("@hapi/boom");
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require("express");
const fileUpload = require('express-fileupload');
const cors = require('cors');
const bodyParser = require("body-parser");
const app = require("express")()
// enable files upload
app.use(fileUpload({
    createParentPath: true
}));

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
const server = require("http").createServer(app);
const io = require("socket.io")(server);
const port = process.env.PORT || 3005;
const qrcode = require("qrcode");

app.use("/assets", express.static(__dirname + "/client/assets"));

app.get("/scan", (req, res) => {
  res.sendFile("./client/server.html", {
    root: __dirname,
  });
});

app.get("/", (req, res) => {
  res.sendFile("./client/index.html", {
    root: __dirname,
  });
});
//fungsi suara capital 
function capital(textSound){
    const arr = textSound.split(" ");
    for (var i = 0; i < arr.length; i++) {
        arr[i] = arr[i].charAt(0).toUpperCase() + arr[i].slice(1);
    }
    const str = arr.join(" ");
    return str;
}
const store = makeInMemoryStore({ logger: pino().child({ level: "silent", stream: "store" }) });

let sock;
let qr;
let soket;

async function connectToWhatsApp() {
	const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info')
	let { version, isLatest } = await fetchLatestBaileysVersion();
    sock = makeWASocket({
        printQRInTerminal: true,
		auth: state,
		logger: log({ level: "silent" }),
		version,
		shouldIgnoreJid: jid => isJidBroadcast(jid),
    });
	store.bind(sock.ev);
	sock.multi = true
	sock.ev.on('connection.update', async (update) => {
    	//console.log(update);
		const { connection, lastDisconnect } = update;
		if(connection === 'close') {
            let reason = new Boom(lastDisconnect.error).output.statusCode;
			if (reason === DisconnectReason.badSession) {
				console.log(`Bad Session File, Please Delete ${session} and Scan Again`);
				sock.logout();
			} else if (reason === DisconnectReason.connectionClosed) {
				console.log("Connection closed, reconnecting....");
				connectToWhatsApp();
			} else if (reason === DisconnectReason.connectionLost) {
				console.log("Connection Lost from Server, reconnecting...");
				connectToWhatsApp();
			} else if (reason === DisconnectReason.connectionReplaced) {
				console.log("Connection Replaced, Another New Session Opened, Please Close Current Session First");
				sock.logout();
			} else if (reason === DisconnectReason.loggedOut) {
				console.log(`Device Logged Out, Please Delete ${session} and Scan Again.`);
				sock.logout();
			} else if (reason === DisconnectReason.restartRequired) {
				console.log("Restart Required, Restarting...");
				connectToWhatsApp();
			} else if (reason === DisconnectReason.timedOut) {
				console.log("Connection TimedOut, Reconnecting...");
				connectToWhatsApp();
			} else {
				sock.end(`Unknown DisconnectReason: ${reason}|${lastDisconnect.error}`);
			}
        }else if(connection === 'open') {
			console.log('opened connection');
			let getGroups = await sock.groupFetchAllParticipating();
			let groups = Object.entries(getGroups).slice(0).map(entry => entry[1]);
			console.log(groups);
			return;
        } 
    });
	sock.ev.on("creds.update", saveCreds);
	sock.ev.on("messages.upsert", async ({ messages, type }) => {
        // console.log(messages);
        // console.log(JSON.stringify(messages, undefined, 2))

        // console.log('replying to', messages[0].key.remoteJid)
        // console.log(type);

        if(type === "notify"){
            if(!messages[0].key.fromMe && !messages[0].key.participant) {

                //tentukan jenis pesan berbentuk text                
                const pesan = messages[0].message.conversation;
                //tentukan jenis pesan apakah bentuk list
                const responseList = messages[0].message.listResponseMessage;
                //tentukan jenis pesan apakah bentuk button
                const responseButton = messages[0].message.buttonsResponseMessage;
                
                //tentukan jenis pesan apakah bentuk templateButtonReplyMessage
                const responseReplyButton = messages[0].message.templateButtonReplyMessage;
                
                //nowa dari pengirim pesan sebagai id
                const noWa = messages[0].key.remoteJid;
                
                // await sock.readMessages([messages[0].key]);

                // const id = '123456'
                // const id = noWa
                // const [result] = await sock.onWhatsApp(id)
                // if (result.exists) console.log (`${id} exists on WhatsApp, as jid: ${result.jid}`)

                //kecilkan semua pesan yang masuk lowercase 
                const pesanMasuk = pesan.toLowerCase();

                if(!messages[0].key.fromMe && pesanMasuk === "ping"){
                    await sock.sendMessage(noWa, {text: "Pong"},{quoted: messages[0] });
                }
                else if(!messages[0].key.fromMe && pesanMasuk === "btn") {
                    const buttons = [
                        {buttonId: "id0", buttonText: {displayText: 'Bicara langsung!'}, type: 1},
                        {buttonId: "id1", buttonText: {displayText: 'Info 1!'}, type: 1},
                        {buttonId: "id2", buttonText: {displayText: 'Info 2!'}, type: 1},
                        {buttonId: "id3", buttonText: {displayText: '💵 Info 3'}, type: 1}
                    ]
                    const buttonInfo = {
                        text: "Info Warung Kopi",
                        buttons: buttons,
                        headerType: 1,
                        viewOnce:true
                    }
                    await sock.sendMessage(noWa, buttonInfo, {quoted: messages[0]});
                    
                }
                else if(!messages[0].key.fromMe && responseButton){

                    //console.log(responseButton);
                    
                    if(responseButton.selectedButtonId == "id1"){
                        await sock.sendMessage(noWa, {
                            text:"anda memilih ID tombol ke 1"
                        });  
                    }else if(responseButton.selectedButtonId == "id2"){
                        await sock.sendMessage(noWa, {
                            text:"anda memilih ID tombol ke 2"
                        });  
                    }else if(responseButton.selectedButtonId == "id3"){
                        await sock.sendMessage(noWa, {
                            text:"anda memilih ID tombol ke 3"
                        });  
                    }else if(responseButton.selectedButtonId == "id0"){
                        await sock.sendMessage(noWa, {
                            text:"Baik, tunggu sebentar"
                        });  
                    }
                    else{
                        await sock.sendMessage(noWa, {
                            text: "Pesan tombol invalid"
                        });
                    } 
                    
                }      
                else if(!messages[0].key.fromMe && pesanMasuk === "img") {
                    const buttons = [
                        {buttonId: "id1", buttonText: {displayText: 'Info 1!'}, type: 1},
                        {buttonId: "id2", buttonText: {displayText: 'Info 2!'}, type: 1},
                        {buttonId: "id3", buttonText: {displayText: '💵 Info 3'}, type: 1}
                    ]
                    await sock.sendMessage(noWa, { 
                        image: {
                            url:"./image/KopiJahe.jpeg"
                        },
                        caption:"Ini Kopi Jahe",
                        buttons: buttons,
                        viewOnce:true
                    });
                }
                else if(!messages[0].key.fromMe && pesanMasuk === "sound") {

                    textsound = capital("ini adalah pesan suara dari Robot Whastapp");

                    let API_URL = "https://texttospeech.responsivevoice.org/v1/text:synthesize?text="+textsound+"&lang=id&engine=g3&name=&pitch=0.5&rate=0.5&volume=1&key=kvfbSITh&gender=male";
                    file = fs.createWriteStream("./sound.mp3");
                    const request = https.get(API_URL, async function(response) {
                        await response.pipe(file);
                        response.on("end",async function(){    
                            await sock.sendMessage(noWa, { 
                                audio: { 
                                    url: "sound.mp3",
                                    caption: textsound 
                                }, 
                                mimetype: 'audio/mp4',
                                viewOnce:true
                            });
                        });
                    });
                }
                else if(!messages[0].key.fromMe && pesanMasuk === "list") {

                    const jenismenu = [{
                            title : 'MAKANAN', 
                            rows :[
                                {
                                    title: "Nasi Goreng",
                                    rowId: '1'
                                }, 
                                {
                                    title: "Mie Goreng",
                                    rowId: '2'
                                },
                                {
                                    title: "Bakso Goreng",
                                    rowId: '3'
                                }
                            ]
                    },
                    {
                        title : 'MINUMAN', 
                        rows :[
                            {
                                title: "Kopi Jahe",
                                rowId: '4'
                            }, 
                            {
                                title: "Kopi Susu",
                                rowId: '5'
                            }
                        ]
                    }]

                    const listPesan = {
                        text: "Menu Pada Warung Kami",
                        title: "Daftar Menu",
                        buttonText: "Tampilakn Menu",
                        sections : jenismenu,
                        viewOnce:true
                    }
                    
                    await sock.sendMessage(noWa, listPesan, {quoted: messages[0]});
                }              
                else if (!messages[0].key.fromMe && responseList){

                    //cek row id yang dipilih 
                    const pilihanlist = responseList.singleSelectReply.selectedRowId;
                    
                    if(pilihanlist == 1) {
                        await sock.sendMessage(noWa, { text: "Anda Memilih Item Makanan Nasi Goreng "});
                    }
                    else if (pilihanlist == 2) {
                        await sock.sendMessage(noWa, { text: "Anda Memilih Item Makanan Mie Goreng "});
                    }
                    else if (pilihanlist == 3) {
                        await sock.sendMessage(noWa, { text: "Anda Memilih Item Makanan Bakso Goreng "});
                    }
                    else if (pilihanlist == 4) {
                        await sock.sendMessage(noWa, { 
                            image: {
                                url:"./image/KopiJahe.jpeg"
                            },
                            caption:"Anda Memilih Item Minuman Kopi Jahe",
                            viewOnce:true
                        });
                    }
                    else if (pilihanlist == 5) {
                        await sock.sendMessage(noWa, { 
                            image: {
                                url:"./image/KopiSusu.jpeg"
                            },
                            caption:"Anda Memilih Item Minuman Kopi Susu",
                            viewOnce:true
                        });
                    }
                    else{
                        await sock.sendMessage(noWa, {text: "Pilihan Invalid!"},{quoted: messages[0] });
                    }    
                }
                else if(!messages[0].key.fromMe && pesanMasuk === "pdf") {
                    let file = "putusan_1233_pdt.g_2018_pa.gs_20230116125746.pdf";
                    await sock.sendMessage(noWa, {
                        document: { url: file },
                        caption: "Pesan file", 
                        fileName: file, 
                        mimetype: file.mimetype 
                    });
                }
                else if(!messages[0].key.fromMe && !messages[0].key.participant && pesanMasuk === "template"){
                    const templateButtons = [
                        {index: 0, urlButton: {displayText: 'Lihat sample!', url: 'https://youtube.com/@majacode'}},
                        {index: 1, callButton: {displayText: 'Hotline CS', phoneNumber: '+6281252053792'}},
                        {index: 2, quickReplyButton: {displayText: 'Oke Sudah jelas infonya min!', id: 'id-button_trims'}},
                        {index: 3, quickReplyButton: {displayText: 'Kurang jelas!', id: 'id-button_kurang_jelas'}},
                        {index: 4, quickReplyButton: {displayText: 'Siap, pesan 5000ton Wood Pellet!', id: 'id-langsung-order'}}
                    ]

                    const templateMessage = {
                        text: "Anda ingin segera order?",
                        footer: 'Hubungi kami segera! untuk mendapatkan diskon terbaik',
                        templateButtons: templateButtons,
                        viewOnce : true
                    }
                    await sock.sendMessage(noWa, templateMessage, {quoted: messages[0]});
                
                }
                else if(!messages[0].key.fromMe && !messages[0].key.participant && responseReplyButton ){
                    console.log(responseReplyButton);
                    if(responseReplyButton.selectedId == "id-button_trims"){
                        await sock.sendMessage(noWa, {
                            text:"*Terima kasih* sudah mengunjungi kami, \nSukses dan sehat selalu untuk *anda dan keluarga*."
                        });  
                    }
                    else if(responseReplyButton.selectedId == "id-button_kurang_jelas") {
                        await sock.sendMessage(noWa, {
                            text:"*Bila informasi kurang jelas* silahkan mengunjungi website kami di, \nhttps://www.youtube.com/watch?v=xF0Z6Te2yO8"
                        }); 
                        console.log("Merasa kurang jelas");
                    }
                    else if(responseReplyButton.selectedId == "id-langsung-order") {
                        await sock.sendMessage(noWa, {
                            text:"Silahkan kunjungi form *pesanan order * di tautan berikut:, \nhttps://www.docs.google.com/forms/d/1Ht5W_qnCOJpaAQlMSJpw0I8kp840iWeDiRJDHlOqLdk/edit"
                        }); 
                        console.log("Alhamdulillah, Orangnya order hahha");
                    }
                }
                else{
                    await sock.sendMessage(noWa, {text: "Selamat datang"},{quoted: messages[0] });
                }
            }	
        
		}

    });
}

io.on("connection", async (socket) => {
    soket = socket;
    // console.log(sock)
    if (isConnected) {
        updateQR("connected");
    } else if (qr) {
        updateQR("qr");   
    }
});

// functions
const isConnected = () => {
    return (sock.user);
};

const updateQR = (data) => {
    switch (data) {
        case "qr":
            qrcode.toDataURL(qr, (err, url) => {
                soket?.emit("qr", url);
                soket?.emit("log", "QR Code received, please scan!");
            });
            break;
        case "connected":
            soket?.emit("qrstatus", "./assets/check.svg");
            soket?.emit("log", "WhatsApp terhubung!");
            break;
        case "qrscanned":
            soket?.emit("qrstatus", "./assets/check.svg");
            soket?.emit("log", "QR Code Telah discan!");
            break;
        case "loading":
            soket?.emit("qrstatus", "./assets/loader.gif");
            soket?.emit("log", "Registering QR Code , please wait!");
            break;
        default:
            break;
    }
};

// send text message to wa user
app.post("/send-message", async (req, res) =>{
    //console.log(req);
    const pesankirim = req.body.message;
    const number = req.body.number;
    const fileDikirim = req.files;
    
	let numberWA;
    try {
        if(!req.files) 
        {
            if(!number) {
                 res.status(500).json({
                    status: false,
                    response: 'Nomor WA belum tidak disertakan!'
                });
            }
            else
            {
                numberWA = '62' + number.substring(1) + "@s.whatsapp.net"; 
                console.log(await sock.onWhatsApp(numberWA));
                if (isConnected) {
                    const exists = await sock.onWhatsApp(numberWA);
                    if (exists?.jid || (exists && exists[0]?.jid)) {
                        sock.sendMessage(exists.jid || exists[0].jid, { text: pesankirim })
                        .then((result) => {
                            res.status(200).json({
                                status: true,
                                response: result,
                            });
                        })
                        .catch((err) => {
                            res.status(500).json({
                                status: false,
                                response: err,
                            });
                        });
                    } else {
                        res.status(500).json({
                            status: false,
                            response: `Nomor ${number} tidak terdaftar.`,
                        });
                    }
                } else {
                    res.status(500).json({
                        status: false,
                        response: `WhatsApp belum terhubung.`,
                    });
                }    
            }
        }
        else
        {
            //console.log('Kirim document');
            if(!number) {
                 res.status(500).json({
                    status: false,
                    response: 'Nomor WA belum tidak disertakan!'
                });
            }
            else
            {
                
                numberWA = '62' + number.substring(1) + "@s.whatsapp.net"; 
                //console.log('Kirim document ke'+ numberWA);
                let filesimpan = req.files.file_dikirim;
                var file_ubah_nama = new Date().getTime() +'_'+filesimpan.name;
                //pindahkan file ke dalam upload directory
                filesimpan.mv('./uploads/' + file_ubah_nama);
                let fileDikirim_Mime = filesimpan.mimetype;
                //console.log('Simpan document '+fileDikirim_Mime);

                //console.log(await sock.onWhatsApp(numberWA));

                if (isConnected) {
                    const exists = await sock.onWhatsApp(numberWA);

                    if (exists?.jid || (exists && exists[0]?.jid)) {
                        
                        let namafiledikirim = './uploads/' + file_ubah_nama;
                        let extensionName = path.extname(namafiledikirim); 
                        //console.log(extensionName);
                        if( extensionName === '.jpeg' || extensionName === '.jpg' || extensionName === '.png' || extensionName === '.gif' ) {
                             await sock.sendMessage(exists.jid || exists[0].jid, { 
                                image: {
                                    url: namafiledikirim
                                },
                                caption:pesankirim
                            }).then((result) => {
                                if (fs.existsSync(namafiledikirim)) {
                                    fs.unlink(namafiledikirim, (err) => {
                                        if (err && err.code == "ENOENT") {
                                            // file doens't exist
                                            console.info("File doesn't exist, won't remove it.");
                                        } else if (err) {
                                            console.error("Error occurred while trying to remove file.");
                                        }
                                        //console.log('File deleted!');
                                    });
                                }
                                res.send({
                                    status: true,
                                    message: 'Success',
                                    data: {
                                        name: filesimpan.name,
                                        mimetype: filesimpan.mimetype,
                                        size: filesimpan.size
                                    }
                                });
                            }).catch((err) => {
                                res.status(500).json({
                                    status: false,
                                    response: err,
                                });
                                console.log('pesan gagal terkirim');
                            });
                        }else if(extensionName === '.mp3' || extensionName === '.ogg'  ) {
                            await sock.sendMessage(exists.jid || exists[0].jid, { 
                               audio: { 
                                    url: namafiledikirim,
                                    caption: pesankirim 
                                }, 
                                mimetype: 'audio/mp4'
                            }).then((result) => {
                                if (fs.existsSync(namafiledikirim)) {
                                    fs.unlink(namafiledikirim, (err) => {
                                        if (err && err.code == "ENOENT") {
                                            // file doens't exist
                                            console.info("File doesn't exist, won't remove it.");
                                        } else if (err) {
                                            console.error("Error occurred while trying to remove file.");
                                        }
                                        //console.log('File deleted!');
                                    });
                                }
                                res.send({
                                    status: true,
                                    message: 'Success',
                                    data: {
                                        name: filesimpan.name,
                                        mimetype: filesimpan.mimetype,
                                        size: filesimpan.size
                                    }
                                });
                            }).catch((err) => {
                                res.status(500).json({
                                    status: false,
                                    response: err,
                                });
                                console.log('pesan gagal terkirim');
                            });
                        }else {
                            await sock.sendMessage(exists.jid || exists[0].jid, {
                                document: { 
                                    url:  namafiledikirim,
                                    caption: pesankirim 
                                }, 
                                mimetype: fileDikirim_Mime,
                                fileName: filesimpan.name
                            }).then((result) => {
                                if (fs.existsSync(namafiledikirim)) {
                                    fs.unlink(namafiledikirim, (err) => {
                                        if (err && err.code == "ENOENT") {
                                            // file doens't exist
                                            console.info("File doesn't exist, won't remove it.");
                                        } else if (err) {
                                            console.error("Error occurred while trying to remove file.");
                                        }
                                        //console.log('File deleted!');
                                    });
                                }
                                /*
								setTimeout(() => {
                                    sock.sendMessage(exists.jid || exists[0].jid, {text: pesankirim});
                                }, 1000);
								*/
                                res.send({
                                    status: true,
                                    message: 'Success',
                                    data: {
                                        name: filesimpan.name,
                                        mimetype: filesimpan.mimetype,
                                        size: filesimpan.size
                                    }
                                });
                            }).catch((err) => {
                                res.status(500).json({
                                    status: false,
                                    response: err,
                                });
                                console.log('pesan gagal terkirim');
                            });
                        }
                    } else {
                        res.status(500).json({
                            status: false,
                            response: `Nomor ${number} tidak terdaftar.`,
                        });
                    }
                } else {
                    res.status(500).json({
                        status: false,
                        response: `WhatsApp belum terhubung.`,
                    });
                }    
            }
        }
    } catch (err) {
        res.status(500).send(err);
    }
    
});

// send group message
app.post("/send-group-message", async (req, res) =>{
    //console.log(req);
    const pesankirim = req.body.message;
	const id_group = req.body.id_group;
    const fileDikirim = req.files;
	let idgroup;
	let exist_idgroup;
	try {
		if (isConnected) {
			if(!req.files) {
				if(!id_group) {
					 res.status(500).json({
						status: false,
						response: 'Nomor Id Group belum disertakan!'
					});
				}
				else 
				{
					let exist_idgroup = await sock.groupMetadata(id_group);
					console.log(exist_idgroup.id);
					console.log("isConnected");
					if (exist_idgroup?.id || (exist_idgroup && exist_idgroup[0]?.id)) {
						sock.sendMessage(id_group, { text: pesankirim })
						.then((result) => {
							res.status(200).json({
								status: true,
								response: result,
							});
							console.log("succes terkirim");
						})
						.catch((err) => {
							res.status(500).json({
								status: false,
								response: err,
							});
							console.log("error 500");
						});
					} else {
						res.status(500).json({
							status: false,
							response: `ID Group ${id_group} tidak terdaftar.`,
						});
						console.log(`ID Group ${id_group} tidak terdaftar.`);
					}  
				}
				
			} else {
				//console.log('Kirim document');
				if(!id_group) {
					 res.status(500).json({
						status: false,
						response: 'Id Group tidak disertakan!'
					});
				}
				else
				{
					exist_idgroup = await sock.groupMetadata(id_group);
					console.log(exist_idgroup.id);
					//console.log('Kirim document ke group'+ exist_idgroup.subject);
					
					let filesimpan = req.files.file_dikirim;
					var file_ubah_nama = new Date().getTime() +'_'+filesimpan.name;
					//pindahkan file ke dalam upload directory
					filesimpan.mv('./uploads/' + file_ubah_nama);
					let fileDikirim_Mime = filesimpan.mimetype;
					//console.log('Simpan document '+fileDikirim_Mime);
					if (isConnected) {
						if (exist_idgroup?.id || (exist_idgroup && exist_idgroup[0]?.id)) {
							let namafiledikirim = './uploads/' + file_ubah_nama;
							let extensionName = path.extname(namafiledikirim); 
							//console.log(extensionName);
							if( extensionName === '.jpeg' || extensionName === '.jpg' || extensionName === '.png' || extensionName === '.gif' ) {
								 await sock.sendMessage(exist_idgroup.id || exist_idgroup[0].id , { 
									image: {
										url: namafiledikirim
									},
									caption:pesankirim
								}).then((result) => {
									if (fs.existsSync(namafiledikirim)) {
										fs.unlink(namafiledikirim, (err) => {
											if (err && err.code == "ENOENT") {
												// file doens't exist
												console.info("File doesn't exist, won't remove it.");
											} else if (err) {
												console.error("Error occurred while trying to remove file.");
											}
											//console.log('File deleted!');
										});
									}
									res.send({
										status: true,
										message: 'Success',
										data: {
											name: filesimpan.name,
											mimetype: filesimpan.mimetype,
											size: filesimpan.size
										}
									});
								}).catch((err) => {
									res.status(500).json({
										status: false,
										response: err,
									});
									console.log('pesan gagal terkirim');
								});
							}else if(extensionName === '.mp3' || extensionName === '.ogg'  ) {
								 await sock.sendMessage(exist_idgroup.id || exist_idgroup[0].id, {  
								   audio: { 
										url: namafiledikirim,
										caption: pesankirim 
									}, 
									mimetype: 'audio/mp4'
								}).then((result) => {
									if (fs.existsSync(namafiledikirim)) {
										fs.unlink(namafiledikirim, (err) => {
											if (err && err.code == "ENOENT") {
												// file doens't exist
												console.info("File doesn't exist, won't remove it.");
											} else if (err) {
												console.error("Error occurred while trying to remove file.");
											}
											//console.log('File deleted!');
										});
									}
									res.send({
										status: true,
										message: 'Success',
										data: {
											name: filesimpan.name,
											mimetype: filesimpan.mimetype,
											size: filesimpan.size
										}
									});
								}).catch((err) => {
									res.status(500).json({
										status: false,
										response: err,
									});
									console.log('pesan gagal terkirim');
								});
							}else {
								 await sock.sendMessage(exist_idgroup.id || exist_idgroup[0].id, { 
									document: { 
										url:  namafiledikirim,
										caption: pesankirim 
									}, 
									mimetype: fileDikirim_Mime,
									fileName: filesimpan.name
								}).then((result) => {
									if (fs.existsSync(namafiledikirim)) {
										fs.unlink(namafiledikirim, (err) => {
											if (err && err.code == "ENOENT") {
												// file doens't exist
												console.info("File doesn't exist, won't remove it.");
											} else if (err) {
												console.error("Error occurred while trying to remove file.");
											}
											//console.log('File deleted!');
										});
									}
								   
									setTimeout(() => {
										sock.sendMessage(exist_idgroup.id || exist_idgroup[0].id, {text: pesankirim});
									}, 1000);
									
									res.send({
										status: true,
										message: 'Success',
										data: {
											name: filesimpan.name,
											mimetype: filesimpan.mimetype,
											size: filesimpan.size
										}
									});
								}).catch((err) => {
									res.status(500).json({
										status: false,
										response: err,
									});
									console.log('pesan gagal terkirim');
								});
							}
						} else {
							res.status(500).json({
								status: false,
								response: `Nomor ${number} tidak terdaftar.`,
							});
						}
					} else {
						res.status(500).json({
							status: false,
							response: `WhatsApp belum terhubung.`,
						});
					}    
				}
			}
		
		//end is connected
		} else {
			res.status(500).json({
				status: false,
				response: `WhatsApp belum terhubung.`,
			});
		}
		
	//end try
	} catch (err) { 
        res.status(500).send(err);
    }
    
});

connectToWhatsApp()
.catch (err => console.log("unexpected error: " + err) ) // catch any errors
server.listen(port, () => {
  console.log("Server Berjalan pada Port : " + port);
});
