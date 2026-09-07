import * as mongoose from 'mongoose';

const LOCAL_MONGO_URI_CRM = 'mongodb://127.0.0.1:27017/mathionix-crm';

const INTENT_PRESETS = [
  { intents: ['Buyer'], daysOffset: -2 }, // Overdue
  { intents: ['Buyer'], daysOffset: 0 },  // Due Today
  { intents: ['Buyer'], daysOffset: 3 },  // Upcoming
  { intents: ['Seller'], daysOffset: -1 }, // Overdue
  { intents: ['Seller'], daysOffset: 0 },  // Due Today
  { intents: ['Seller'], daysOffset: 5 },  // Upcoming
  { intents: ['Investor'], daysOffset: 0 }, // Due Today
  { intents: ['Investor'], daysOffset: 7 }, // Upcoming
  { intents: ['Farm'], daysOffset: -4 },    // Overdue
  { intents: ['Farm'], daysOffset: 2 },     // Upcoming
  { intents: ['Property Management', 'Buyer'], daysOffset: 0 }, // Due Today
  { intents: ['Property Management'], daysOffset: 4 },
  { intents: ['Subscription'], daysOffset: -3 }, // Overdue
  { intents: ['Subscription'], daysOffset: 1 },
  { intents: ['Buyer', 'Investor'], daysOffset: 0 }, // Due Today
  { intents: ['Seller', 'Farm'], daysOffset: 6 },
];

async function seedLeadIntents() {
  const uri = process.env.MONGO_URI_CRM || process.env.MONGO_URI || LOCAL_MONGO_URI_CRM;
  console.log(`Connecting to MongoDB at ${uri} ...`);
  const conn = mongoose.createConnection(uri);
  await conn.asPromise();

  try {
    const leadColl = conn.collection('leads');
    const eventColl = conn.collection('lead_intent_events');

    const leads = await leadColl.find({ isDeleted: { $ne: true } }).limit(40).toArray();
    console.log(`Found ${leads.length} leads to attach intents.`);

    if (leads.length === 0) {
      console.log('No leads found.');
      return;
    }

    let updatedCount = 0;
    const newEvents: any[] = [];
    const now = new Date();

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      const preset = INTENT_PRESETS[i % INTENT_PRESETS.length];
      
      const followUpDate = new Date(now);
      followUpDate.setDate(now.getDate() + preset.daysOffset);
      followUpDate.setHours(11, 0, 0, 0);

      await leadColl.updateOne(
        { _id: lead._id },
        {
          $set: {
            leadIntents: preset.intents,
            leadIntentFollowUpAt: followUpDate,
          },
        },
      );

      for (const intentLabel of preset.intents) {
        newEvents.push({
          leadId: lead._id,
          intentLabel,
          followUpAt: followUpDate,
          source: 'manual',
          setByName: lead.leadOwner || 'System Admin',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      updatedCount++;
    }

    if (newEvents.length) {
      await eventColl.insertMany(newEvents);
    }

    console.log(`Successfully seeded ${updatedCount} leads with rich lead intents and ${newEvents.length} analytics events!`);
  } catch (err) {
    console.error('Error seeding lead intents:', err);
  } finally {
    await conn.close();
  }
}

seedLeadIntents();
