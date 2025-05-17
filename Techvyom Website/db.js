require('dotenv').config(); // Ensure environment variables are loaded
const mongoose = require('mongoose');

const DB_USER = process.env.DB_USER || 'techvyom_app';
const DB_PASSWORD = process.env.DB_PASSWORD || 'TechvyomSecure123';
const DB_HOST = process.env.DB_HOST || 'project0.s9re3uk.mongodb.net';
const DB_NAME = process.env.DB_NAME || 'techvyomdb';

const mongoURI = `mongodb+srv://${DB_USER}:${DB_PASSWORD}@${DB_HOST}/${DB_NAME}?retryWrites=true&w=majority`;

// Debugging output (password hidden)
console.log(`Connecting to MongoDB at: mongodb+srv://${DB_USER}:*****@${DB_HOST}/${DB_NAME}`);

mongoose.connect(mongoURI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 30000
})
.then(() => console.log('✅ MongoDB connection established successfully'))
.catch(err => {
  console.error('❌ MongoDB connection failed:', err.message);
  console.error('Full error details:', err);
  process.exit(1);
});

mongoose.connection.on('error', err => {
  console.error('MongoDB runtime error:', err);
});

module.exports = mongoose;
// Define schemas that match your SQL tables
const registrationSchema = new mongoose.Schema({
  pid: { type: String, unique: true },
  name: String,
  phoneno: String,
  rollno: String,
  college: String,
  course: String,
  year: String
});

const eventSchema = new mongoose.Schema({
  registration_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration' },
  event_name: String
});

const teamSchema = new mongoose.Schema({
  team_id: { type: String, unique: true },
  team_name: String
});

const teamMemberSchema = new mongoose.Schema({
  team_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  registration_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration' }
});

const teamEventSchema = new mongoose.Schema({
  team_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  event_name: String
});

// Create models
const Registration = mongoose.model('Registration', registrationSchema);
const Event = mongoose.model('Event', eventSchema);
const Team = mongoose.model('Team', teamSchema);
const TeamMember = mongoose.model('TeamMember', teamMemberSchema);
const TeamEvent = mongoose.model('TeamEvent', teamEventSchema);

// Modified initDatabase function to maintain similar structure
function initDatabase() {
  return new Promise((resolve, reject) => {
    mongoose.connection.on('connected', () => {
      console.log("✅ Connected to MongoDB");
      
      // MongoDB creates collections automatically, so we just verify connection
      console.log("✅ Database collections ensured");
      resolve({
        Registration,
        Event,
        Team,
        TeamMember,
        TeamEvent
      });
    });

    mongoose.connection.on('error', (err) => {
      console.error("Database connection error:", err);
      reject(err);
    });
  });
}

// Export the same structure but with Mongoose models
module.exports = { 
  connection: mongoose.connection, 
  initDatabase,
  Registration,
  Event,
  Team, 
  TeamMember,
  TeamEvent
};