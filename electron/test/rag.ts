import { Memory } from "mem0ai/oss";

const memory = new Memory();


const messages = [
    { role: "user", content: "I'm planning to watch a movie tonight. Any recommendations?" },
    { role: "assistant", content: "How about thriller movies? They can be quite engaging." },
    { role: "user", content: "I'm not a big fan of thriller movies but I love sci-fi movies." },
    { role: "assistant", content: "Got it! I'll avoid thriller recommendations and suggest sci-fi movies in the future." }
  ];
  
await memory.add(messages, { userId: "alice", metadata: { category: "movie_recommendations" } });

const results = await memory.search("What do you know about me?", { filters: { userId: "alice" } });
console.log(results);