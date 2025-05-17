const mysql = require('mysql2');

const dbName = 'techvyom2025';

// Connect without specifying a database first
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'net@123' // update if you have a password
});

function initDatabase() {
  connection.connect(err => {
    if (err) throw err;
    console.log("✅ Connected to MySQL");

    // Create the database if it doesn't exist
    connection.query(`CREATE DATABASE IF NOT EXISTS ${dbName}`, (err) => {
      if (err) throw err;
      console.log(`✅ Database '${dbName}' ensured`);

      // Now switch to using that database
      connection.changeUser({ database: dbName }, (err) => {
        if (err) throw err;

        // Now create tables
        const createRegistrationsTable = `
          CREATE TABLE IF NOT EXISTS registrations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            pid VARCHAR(20) UNIQUE,
            name VARCHAR(100),
            phoneno VARCHAR(15),
            
            rollno VARCHAR(50),
            
            college VARCHAR(150),
            course VARCHAR(100),
            year VARCHAR(10)
          )`;

        connection.query(createRegistrationsTable, (err) => {
          if (err) throw err;
          console.log("✅ Registrations table ensured");

          const createEventsTable = `
            CREATE TABLE IF NOT EXISTS events (
              id INT AUTO_INCREMENT PRIMARY KEY,
              registration_id INT,
              event_name VARCHAR(100),
              FOREIGN KEY (registration_id) REFERENCES registrations(id)
            )`;

          connection.query(createEventsTable, (err) => {
            if (err) throw err;
            console.log("✅ Events table ensured");

            const createTeamsTable = `
              CREATE TABLE IF NOT EXISTS teams (
                id INT AUTO_INCREMENT PRIMARY KEY,
                team_id VARCHAR(20) UNIQUE,
                team_name VARCHAR(100)
              )`;

            connection.query(createTeamsTable, (err) => {
              if (err) throw err;
              console.log("✅ Teams table ensured");

              const createTeamMembersTable = `
                CREATE TABLE IF NOT EXISTS team_members (
                  id INT AUTO_INCREMENT PRIMARY KEY,
                  team_id INT,
                  registration_id INT,
                  FOREIGN KEY (team_id) REFERENCES teams(id),
                  FOREIGN KEY (registration_id) REFERENCES registrations(id)
                )`;

              connection.query(createTeamMembersTable, (err) => {
                if (err) throw err;
                console.log("✅ Team members table ensured");

                const createTeamEventsTable = `
                  CREATE TABLE IF NOT EXISTS team_events (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    team_id INT,
                    event_name VARCHAR(100),
                    FOREIGN KEY (team_id) REFERENCES teams(id)
                  )`;

                connection.query(createTeamEventsTable, (err) => {
                  if (err) throw err;
                  console.log("✅ Team events table ensured");
                });
              });
            });
          });
        });
      });
    });
  });
}

module.exports = { connection, initDatabase };
