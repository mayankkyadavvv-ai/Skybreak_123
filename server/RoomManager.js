import crypto from 'node:crypto';
import { Room } from './Room.js';
export class RoomManager {
  constructor({maxRooms=100}={}){this.rooms=new Map();this.clientRooms=new Map();this.maxRooms=maxRooms;}
  generateRoomCode(){const chars='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';let code;do{code='SKY-'+[...crypto.randomBytes(4)].map(n=>chars[n%chars.length]).join('');}while(this.rooms.has(code));return code;}
  createRoom(client,options={}){if(this.rooms.size>=this.maxRooms)throw new Error('Room capacity reached. Try again shortly.');this.leaveRoom(client);const code=this.generateRoomCode(),room=new Room(code,client,options);this.rooms.set(code,room);this.clientRooms.set(client.id,code);return room;}
  joinRoom(code,client,name){if(typeof code!=='string'||!/^SKY-[A-Z2-9]{4}$/i.test(code.trim()))return{success:false,reason:'Invalid room code'};const room=this.getRoom(code);if(!room)return{success:false,reason:'Room not found or expired'};if(room.players.has(client.id))return{success:true,room,player:room.players.get(client.id)};if(room.players.size>=room.options.maxPlayers)return{success:false,reason:'Room is full; disconnected seats are temporarily reserved'};if(!['lobby','in_game'].includes(room.state))return{success:false,reason:'Match is starting or finished'};this.leaveRoom(client);const r=room.addPlayer(client,name);if(r.success)this.clientRooms.set(client.id,room.code);return{...r,room};}
  disconnect(client,expiresAt){this.getRoomByClient(client.id)?.disconnectPlayer(client.id,expiresAt);}
  resume(client){return this.getRoomByClient(client.id)?.resumePlayer(client)||false;}
  leaveRoom(client){const code=this.clientRooms.get(client.id);if(!code)return;const room=this.rooms.get(code);room?.removePlayer(client.id);if(room&&!room.players.size){room.cleanup();this.rooms.delete(code);}this.clientRooms.delete(client.id);client.roomCode=null;}
  getRoom(code){return this.rooms.get(typeof code==='string'?code.trim().toUpperCase():'');}
  getRoomByClient(id){return this.rooms.get(this.clientRooms.get(id))||null;}
}
