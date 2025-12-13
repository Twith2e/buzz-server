export default function (io, socket) {
  socket.on("offer", ({ to, from, offer }) => {
    io.to(to).emit("offer", {
      from,
      offer,
    });
  });

  socket.on("answer", ({ to, from, answer }) => {
    io.to(to).emit("answer", {
      from,
      answer,
    });
  });

  socket.on("ice-candidate", ({ to, from, candidate }) => {
    io.to(to).emit("ice-candidate", {
      from,
      candidate,
    });
  });

  socket.on("call-end", ({ to, from }) => {
    io.to(to).emit("call-end", { from });
  });
}
