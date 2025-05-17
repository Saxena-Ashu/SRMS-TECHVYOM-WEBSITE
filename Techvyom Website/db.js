const mongoose = require('mongoose');

// Make sure you're using the correct environment variable name
const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/yourdb';
console.log('MONGODB_URI:', process.env.MONGODB_URI);

mongoose.connect(mongoURI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Connection error:', err));

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