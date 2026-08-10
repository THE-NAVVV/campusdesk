// ============ backend/seed.js ============
import db from "./db.js";


db.exec(`DELETE FROM resources;`);


db.prepare(
  `INSERT OR IGNORE INTO users (name, email, role) VALUES (?, ?, 'admin')`
).run("Admin User", "admin@lnmiit.ac.in");


const resources = [
  
  ...Array.from({ length: 10 }, (_, i) => [
    `LT ${i + 1}`,
    "Lecture theatre",
    "Academic Building",
    "hall",
    "08:00",
    "20:00",
  ]),

  // ---- Lecture Theatres — Mechanical & Mechatronics Department (LT11–LT15) ----
  ...Array.from({ length: 5 }, (_, i) => [
    `LT ${i + 11}`,
    "Lecture theatre",
    "Mechanical and Mechatronics Department",
    "hall",
    "08:00",
    "20:00",
  ]),

  // ---- Lecture Theatres — Incubation Building (LT16–LT19) ----
  ...Array.from({ length: 4 }, (_, i) => [
    `LT ${i + 16}`,
    "Lecture theatre",
    "Incubation Building",
    "hall",
    "08:00",
    "20:00",
  ]),

  // ---- General / CS Labs ----
  ["CRIA Lab", "Centre for Robotics and Industrial Automation", "Mechanical and Mechatronics Department", "room", "09:00", "19:00"],
  ["Computer Lab 1", "General computing lab", "Academic Building", "room", "09:00", "21:00"],
  ["Computer Lab 2", "General computing lab", "Academic Building", "room", "09:00", "21:00"],
  ["Computer Lab 3", "General computing lab", "Academic Building", "room", "09:00", "21:00"],
  ["CMLBDA Lab", "Centre for Machine Learning and Big Data Analytics", "Academic Building", "room", "09:00", "19:00"],
  ["UG Physics Lab and Optics Lab", "Undergraduate physics and optics experiments", "Academic Building", "room", "09:00", "18:00"],

  // ---- ECE Labs ----
  ["Analog Electronics Laboratory", "ECE department lab", "ECE Department", "room", "09:00", "18:00"],
  ["Basic Electronics Laboratory", "ECE department lab", "ECE Department", "room", "09:00", "18:00"],
  ["Digital Circuits and System Laboratory", "ECE department lab", "ECE Department", "room", "09:00", "18:00"],
  ["Design Laboratory - 1", "ECE department lab", "ECE Department", "room", "09:00", "18:00"],
  ["Design Laboratory - 2", "ECE department lab", "ECE Department", "room", "09:00", "18:00"],
  ["Digital Signal Processing Laboratory", "ECE department lab", "ECE Department", "room", "09:00", "18:00"],
  ["Analog and Digital Communication Laboratory", "ECE department lab", "ECE Department", "room", "09:00", "18:00"],
  ["Wireless Communication Laboratory", "ECE department lab", "ECE Department", "room", "09:00", "18:00"],
  ["Microwave Laboratory", "ECE department lab", "ECE Department", "room", "09:00", "18:00"],
  ["Microprocessor & Interface Laboratory", "ECE department lab", "ECE Department", "room", "09:00", "18:00"],

  // ---- MME Labs (Mechanical, Mechatronics & Manufacturing Engineering) ----
  ["Mechanical Workshop", "MME department workshop", "Mechanical and Mechatronics Department", "room", "09:00", "18:00"],
  ["Mechatronics Laboratory", "MME department lab", "Mechanical and Mechatronics Department", "room", "09:00", "18:00"],
  ["Kinematics and Dynamics Laboratory", "MME department lab", "Mechanical and Mechatronics Department", "room", "09:00", "18:00"],
  ["Heat Transfer Laboratory", "MME department lab", "Mechanical and Mechatronics Department", "room", "09:00", "18:00"],
  ["Computer Aided Design (CAD) Laboratory", "MME department lab", "Mechanical and Mechatronics Department", "room", "09:00", "18:00"],
  ["Engineering Graphics Laboratory", "MME department lab", "Mechanical and Mechatronics Department", "room", "09:00", "18:00"],
  ["Material Characterization Laboratory", "MME department lab", "Mechanical and Mechatronics Department", "room", "09:00", "18:00"],
  ["Thermodynamics Laboratory", "MME department lab", "Mechanical and Mechatronics Department", "room", "09:00", "18:00"],
  ["Internal Combustion Engine Laboratory", "MME department lab", "Mechanical and Mechatronics Department", "room", "09:00", "18:00"],
  ["Fluid Mechanics and Machines Laboratory", "MME department lab", "Mechanical and Mechatronics Department", "room", "09:00", "18:00"],
  ["Computer Integrated Manufacturing (CIM) Laboratory", "MME department lab", "Mechanical and Mechatronics Department", "room", "09:00", "18:00"],
  ["Robotics & Industrial Automation Laboratory", "MME department lab", "Mechanical and Mechatronics Department", "room", "09:00", "18:00"],
  ["Automotive Engineering Laboratory", "MME department lab", "Mechanical and Mechatronics Department", "room", "09:00", "18:00"],
  ["Measurement Instrumentation and Control Laboratory", "MME department lab", "Mechanical and Mechatronics Department", "room", "09:00", "18:00"],

  // ---- Halls ----
  ["Seminar Hall", "Main seminar hall with projector and mic setup", "Academic Building", "hall", "08:00", "20:00"],
  ["Conference Room", "Small meeting/conference room", "Academic Building", "hall", "08:00", "20:00"],
];

const insertResource = db.prepare(
  `INSERT INTO resources (name, description, location, category, openTime, closeTime) VALUES (?, ?, ?, ?, ?, ?)`
);
resources.forEach((r) => insertResource.run(...r));

console.log(`Seed complete: resources reset, ${resources.length} resources inserted. Users and bookings were left untouched.`);