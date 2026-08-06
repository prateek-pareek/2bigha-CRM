const mongoose = require('mongoose');

const uri = 'mongodb://localhost:27017/mathionix-hrms';

const jobOpeningSchema = new mongoose.Schema({
  jobTitle: { type: String, required: true },
  designation: { type: String, required: true },
  status: { type: String, default: 'Open' },
  company: { type: String, required: true },
  department: String,
  employmentType: String,
  location: String,
  description: String,
  postedOn: { type: Date, default: Date.now },
  closesOn: Date,
  closedOn: Date,
  applicationFormFields: [{ type: Object }]
}, { timestamps: true });

// mongoose automatically pluralizes to 'jobopenings' or we can specify collection
const JobOpening = mongoose.model('JobOpening', jobOpeningSchema);

async function seed() {
  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    const jobs = [
      {
        jobTitle: 'Senior Frontend Developer',
        designation: 'SDE II',
        status: 'Open',
        company: 'Mathionix',
        department: 'Engineering',
        employmentType: 'Full-time',
        location: 'Remote',
        description: 'We are looking for an experienced frontend developer proficient in React, Next.js, and modern CSS frameworks like Tailwind.',
        postedOn: new Date(),
        applicationFormFields: []
      },
      {
        jobTitle: 'Backend Engineer',
        designation: 'SDE I',
        status: 'Open',
        company: 'Mathionix',
        department: 'Engineering',
        employmentType: 'Full-time',
        location: 'Hybrid',
        description: 'Looking for a backend enthusiast with strong skills in Node.js, NestJS, and MongoDB.',
        postedOn: new Date(),
        applicationFormFields: []
      },
      {
        jobTitle: 'Product Designer',
        designation: 'Senior Designer',
        status: 'Open',
        company: 'Mathionix',
        department: 'Design',
        employmentType: 'Contract',
        location: 'Remote',
        description: 'Seeking a creative product designer with experience in Figma, UI/UX, and prototyping.',
        postedOn: new Date(),
        applicationFormFields: []
      }
    ];

    const result = await JobOpening.insertMany(jobs);
    console.log(`Successfully inserted ${result.length} job openings`);

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }
}

seed();
