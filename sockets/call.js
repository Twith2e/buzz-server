export default function (io, socket) {
  socket.on("call:offer", ({ to, from, offer, type }) => {
    console.log("Emitting to room:", to);
    console.log("Room members:", io.sockets.adapter.rooms.get(to));

    io.to(to).emit("call:incoming", {
      from,
      type,
    });

    io.to(to).emit("webrtc:offer", {
      from,
      offer,
      type,
    });
  });

  socket.on("webrtc:answer", ({ to, from, answer }) => {
    io.to(to).emit("webrtc:answer", {
      from,
      answer,
    });
  });

  socket.on("webrtc:ice-candidate", ({ to, from, candidate }) => {
    io.to(to).emit("webrtc:ice-candidate", {
      from,
      candidate,
    });
  });

  socket.on("call:end", ({ to, from }) => {
    io.to(to).emit("call:end", { from });
  });
}
