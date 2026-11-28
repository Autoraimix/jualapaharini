import {
  ABANG_FAUZI,
  PAK_CIK_JAMAL,
  MAK_CIK_HABIBAH,
  CIKGU_AZIZAH,
  ENCIK_RASHID,
  FARHAN,
  KAK_ROZIE,
  AIN_SISWI,
  KAMAL_BRADER_BENGKEL,
  UNCLE_AH_CHUAN,
  UNCLE_RAVI,
  KAK_LIN_PERSONA_PROMPT,
  AUNTIE_FAUZIAH_PERSONA_PROMPT,
  AISY_EKSEKUTIF_MUDA,
} from './personasData.js';

export function getPersonaPrompt(persona = '') {
  if (persona === 'Kak Lin Taman Dahlia' || persona.includes('Kak Lin Taman Dahlia')) {
    return `You are a persona named Kak Lin Taman Dahlia writing engaging content for Meta Threads. Each post must be under 500 characters.\n\n${KAK_LIN_PERSONA_PROMPT}`;
  }
  if (persona === 'Auntie Fauziah' || persona.includes('Auntie Fauziah')) {
    return `You are a persona named Auntie Fauziah writing engaging content for Meta Threads. Each post must be under 500 characters.\n\n${AUNTIE_FAUZIAH_PERSONA_PROMPT}`;
  }
  if (persona === 'Abang Fauzi Kontraktor & Runner' || persona.includes('Abang Fauzi')) {
    return `You are a persona named Abang Fauzi writing engaging content for Meta Threads. Each post must be under 500 characters.\n\n${ABANG_FAUZI}`;
  }
  if (persona === 'Pak Cik Jamal Pencen Tegar' || persona.includes('Pak Cik Jamal')) {
    return `You are a persona named Pak Cik Jamal writing engaging content for Meta Threads. Each post must be under 500 characters.\n\n${PAK_CIK_JAMAL}`;
  }
  if (persona === 'Mak Cik Habibah Usahawan Kuih Kampung' || persona.includes('Mak Cik Habibah')) {
    return `You are a persona named Mak Cik Habibah writing engaging content for Meta Threads. Each post must be under 500 characters.\n\n${MAK_CIK_HABIBAH}`;
  }
  if (persona === 'Cikgu Azizah Pendidik Berdedikasi' || persona.includes('Cikgu Azizah')) {
    return `You are a persona named Cikgu Azizah writing engaging content for Meta Threads. Each post must be under 500 characters.\n\n${CIKGU_AZIZAH}`;
  }
  if (persona === 'Encik Rashid Pengurus Korporat T20' || persona.includes('Encik Rashid')) {
    return `You are a persona named Encik Rashid writing engaging content for Meta Threads. Each post must be under 500 characters.\n\n${ENCIK_RASHID}`;
  }
  if (persona === 'Farhan Belia Gen Z & Gig Rider' || persona.includes('Farhan Belia Gen Z')) {
    return `You are a persona named Farhan writing engaging content for Meta Threads. Each post must be under 500 characters.\n\n${FARHAN}`;
  }
  if (persona === 'Kak Rozie Diva Kosmetik & TikToker' || persona.includes('Kak Rozie Diva')) {
    return `You are a persona named Kak Rozie writing engaging content for Meta Threads. Each post must be under 500 characters.\n\n${KAK_ROZIE}`;
  }
  if (persona === 'Ain Siswi Universiti & Aktivis Kreatif' || persona.includes('Ain Siswi Universiti')) {
    return `You are a persona named Ain Siswi writing engaging content for Meta Threads. Each post must be under 500 characters.\n\n${AIN_SISWI}`;
  }
  if (persona === 'Kamal Brader Bengkel Abang Long' || persona.includes('Kamal Brader Bengkel')) {
    return `You are a persona named Kamal Brader Bengkel writing engaging content for Meta Threads. Each post must be under 500 characters.\n\n${KAMAL_BRADER_BENGKEL}`;
  }
  if (persona === 'Uncle Ah Chuan Kedai Hardware Komuniti' || persona.includes('Uncle Ah Chuan')) {
    return `You are a persona named Uncle Ah Chuan writing engaging content for Meta Threads. Each post must be under 500 characters.\n\n${UNCLE_AH_CHUAN}`;
  }
  if (persona === 'Uncle Ravi Pemandu E-Hailing Veteran' || persona.includes('Uncle Ravi')) {
    return `You are a persona named Uncle Ravi writing engaging content for Meta Threads. Each post must be under 500 characters.\n\n${UNCLE_RAVI}`;
  }
  if (persona === "Aisy Eksekutif Muda & 'Independent Woman'" || persona.includes('Aisy Eksekutif Muda')) {
    return `You are a persona named Aisy writing engaging content for Meta Threads. Each post must be under 500 characters.\n\n${AISY_EKSEKUTIF_MUDA}`;
  }
  return `You are a ${persona} writing engaging content for Meta Threads. Each post must be under 500 characters.`;
}

export function getGroupPersonaPrompt(personaList = '') {
  let prompt = `You are an expert social media copywriter for Meta's Threads.\nVoice: A seamless blend of ${personaList}.`;

  if (personaList.includes('Kak Lin Taman Dahlia')) {
    prompt += `\n\nWhen writing as Kak Lin Taman Dahlia, adhere STRICTLY to these traits:\n${KAK_LIN_PERSONA_PROMPT}`;
  }
  if (personaList.includes('Auntie Fauziah')) {
    prompt += `\n\nWhen writing as Auntie Fauziah, adhere STRICTLY to these traits:\n${AUNTIE_FAUZIAH_PERSONA_PROMPT}`;
  }
  if (personaList.includes('Abang Fauzi')) {
    prompt += `\n\nWhen writing as Abang Fauzi, adhere STRICTLY to these traits:\n${ABANG_FAUZI}`;
  }
  if (personaList.includes('Pak Cik Jamal')) {
    prompt += `\n\nWhen writing as Pak Cik Jamal, adhere STRICTLY to these traits:\n${PAK_CIK_JAMAL}`;
  }
  if (personaList.includes('Mak Cik Habibah')) {
    prompt += `\n\nWhen writing as Mak Cik Habibah, adhere STRICTLY to these traits:\n${MAK_CIK_HABIBAH}`;
  }
  if (personaList.includes('Cikgu Azizah')) {
    prompt += `\n\nWhen writing as Cikgu Azizah, adhere STRICTLY to these traits:\n${CIKGU_AZIZAH}`;
  }
  if (personaList.includes('Encik Rashid')) {
    prompt += `\n\nWhen writing as Encik Rashid, adhere STRICTLY to these traits:\n${ENCIK_RASHID}`;
  }
  if (personaList.includes('Farhan Belia Gen Z')) {
    prompt += `\n\nWhen writing as Farhan, adhere STRICTLY to these traits:\n${FARHAN}`;
  }
  if (personaList.includes('Kak Rozie Diva')) {
    prompt += `\n\nWhen writing as Kak Rozie, adhere STRICTLY to these traits:\n${KAK_ROZIE}`;
  }
  if (personaList.includes('Ain Siswi Universiti')) {
    prompt += `\n\nWhen writing as Ain Siswi, adhere STRICTLY to these traits:\n${AIN_SISWI}`;
  }
  if (personaList.includes('Kamal Brader Bengkel')) {
    prompt += `\n\nWhen writing as Kamal Brader Bengkel, adhere STRICTLY to these traits:\n${KAMAL_BRADER_BENGKEL}`;
  }
  if (personaList.includes('Uncle Ah Chuan')) {
    prompt += `\n\nWhen writing as Uncle Ah Chuan, adhere STRICTLY to these traits:\n${UNCLE_AH_CHUAN}`;
  }
  if (personaList.includes('Uncle Ravi')) {
    prompt += `\n\nWhen writing as Uncle Ravi, adhere STRICTLY to these traits:\n${UNCLE_RAVI}`;
  }
  if (personaList.includes('Aisy Eksekutif Muda')) {
    prompt += `\n\nWhen writing as Aisy, adhere STRICTLY to these traits:\n${AISY_EKSEKUTIF_MUDA}`;
  }

  return prompt;
}
