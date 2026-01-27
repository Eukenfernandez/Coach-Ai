/**
 * Sport and Discipline Translations
 * 
 * This utility provides translated names for sports and disciplines
 * used in Onboarding and Profile components.
 * 
 * IMPORTANT: The internal storage key (e.g., 'Lanz. Jabalina') remains
 * in Spanish for database consistency. Only the DISPLAY label is translated.
 */

type Language = 'es' | 'ing' | 'eus';

// Sport Category Translations
export const SPORT_CATEGORIES: Record<Language, Record<string, string>> = {
    es: {
        gym: 'Gimnasio / Fitness',
        athletics: 'Atletismo',
        soccer: 'Fútbol',
        basketball: 'Baloncesto',
        tennis_padel: 'Tenis / Pádel',
        combat: 'Deportes de Combate',
        baseball: 'Béisbol / Softbol',
        rugby_football: 'Rugby / Fútbol Americano',
        water: 'Deportes Acuáticos',
        cycling: 'Ciclismo',
        other: 'Otros'
    },
    ing: {
        gym: 'Gym / Fitness',
        athletics: 'Athletics',
        soccer: 'Soccer / Football',
        basketball: 'Basketball',
        tennis_padel: 'Tennis / Padel',
        combat: 'Combat Sports',
        baseball: 'Baseball / Softball',
        rugby_football: 'Rugby / American Football',
        water: 'Water Sports',
        cycling: 'Cycling',
        other: 'Other'
    },
    eus: {
        gym: 'Gimnasioa / Fitness',
        athletics: 'Atletismoa',
        soccer: 'Futbola',
        basketball: 'Saskibaloia',
        tennis_padel: 'Tenisa / Padela',
        combat: 'Borroka Kirolak',
        baseball: 'Beisbola / Softbola',
        rugby_football: 'Errugbia / Futbol Amerikarra',
        water: 'Ur Kirolak',
        cycling: 'Txirrindularitza',
        other: 'Beste batzuk'
    }
};

// Discipline Translations (key is Spanish internal name, value is translated display name)
export const DISCIPLINE_TRANSLATIONS: Record<Language, Record<string, string>> = {
    es: {
        // Athletics - Running
        '60m': '60m', '100m': '100m', '200m': '200m', '400m': '400m',
        '800m': '800m', '1500m': '1500m', '3000m': '3000m', '5000m': '5000m', '10000m': '10000m',
        'Media Maratón': 'Media Maratón', 'Maratón': 'Maratón', 'Ultramaratón': 'Ultramaratón',
        'Cross Country': 'Cross Country', 'Trail Running': 'Trail Running', 'Running': 'Running',
        // Athletics - Hurdles
        '60m Vallas': '60m Vallas', '100m Vallas': '100m Vallas', '110m Vallas': '110m Vallas',
        '400m Vallas': '400m Vallas', '3000m Obst.': '3000m Obstáculos',
        // Athletics - Jumps
        'Salto Longitud': 'Salto Longitud', 'Triple Salto': 'Triple Salto',
        'Salto Altura': 'Salto Altura', 'Pértiga': 'Pértiga',
        // Athletics - Throws
        'Lanz. Peso': 'Lanz. Peso', 'Lanz. Disco': 'Lanz. Disco',
        'Lanz. Jabalina': 'Lanz. Jabalina', 'Lanz. Martillo': 'Lanz. Martillo',
        // Athletics - Combined/Other
        'Decatlón': 'Decatlón', 'Heptatlón': 'Heptatlón', 'Marcha': 'Marcha', 'Relevos': 'Relevos',
        // Gym
        'Powerlifting': 'Powerlifting', 'Bodybuilding': 'Culturismo', 'CrossFit': 'CrossFit',
        'Calistenia': 'Calistenia', 'Strongman': 'Strongman', 'Halterofilia': 'Halterofilia',
        'Fitness General': 'Fitness General', 'Entrenamiento Funcional': 'Entrenamiento Funcional',
        'HIIT': 'HIIT', 'Street Lifting': 'Street Lifting', 'Kettlebell': 'Kettlebell',
        'Yoga/Pilates': 'Yoga/Pilates', 'Cardio': 'Cardio', 'Natural BB': 'Natural BB', 'Hyrox': 'Hyrox',
        // Soccer
        'Portero': 'Portero', 'Defensa': 'Defensa', 'Lateral': 'Lateral', 'Carrilero': 'Carrilero',
        'Pivote': 'Pivote', 'Interior': 'Interior', 'Mediapunta': 'Mediapunta', 'Extremo': 'Extremo',
        'Delantero': 'Delantero', 'Fútbol Sala (Portero)': 'Fútbol Sala (Portero)',
        'Fútbol Sala (Jugador)': 'Fútbol Sala (Jugador)', 'Fútbol Sala': 'Fútbol Sala', 'Fútbol 7': 'Fútbol 7',
        // Basketball
        'Base': 'Base', 'Escolta': 'Escolta', 'Alero': 'Alero', 'Ala-Pívot': 'Ala-Pívot', 'Pívot': 'Pívot', '3x3': '3x3',
        // Tennis/Padel
        'Tenis': 'Tenis', 'Pádel': 'Pádel', 'Badminton': 'Badminton', 'Squash': 'Squash',
        'Tenis Mesa': 'Tenis de Mesa', 'Pickleball': 'Pickleball', 'Frontón': 'Frontón',
        // Combat
        'Boxeo': 'Boxeo', 'MMA': 'MMA', 'Muay Thai': 'Muay Thai', 'Kickboxing': 'Kickboxing',
        'Judo': 'Judo', 'BJJ': 'BJJ', 'Karate': 'Karate', 'Taekwondo': 'Taekwondo',
        'Lucha': 'Lucha', 'Kung Fu': 'Kung Fu', 'Esgrima': 'Esgrima',
        // Baseball
        'Pitcher': 'Pitcher', 'Catcher': 'Catcher', 'Shortstop': 'Shortstop',
        'Outfielder': 'Outfielder', 'Bateador': 'Bateador', 'Softbol': 'Softbol',
        // Rugby/Football
        'Rugby Forward': 'Rugby Forward', 'Rugby Back': 'Rugby Back', 'Rugby 7s': 'Rugby 7s',
        'QB': 'Quarterback', 'Running Back': 'Running Back', 'Receiver': 'Receptor',
        'Lineman': 'Lineman', 'Linebacker': 'Linebacker', 'Defensive Back': 'Defensive Back', 'Kicker': 'Kicker',
        // Water Sports
        'Natación': 'Natación', 'Aguas Abiertas': 'Aguas Abiertas', 'Waterpolo': 'Waterpolo',
        'Sincronizada': 'Natación Sincronizada', 'Saltos': 'Saltos', 'Surf': 'Surf',
        'Remo': 'Remo', 'Piragüismo': 'Piragüismo', 'Kitesurf': 'Kitesurf', 'Windsurf': 'Windsurf',
        'Paddle Surf': 'Paddle Surf', 'Vela': 'Vela', 'Buceo': 'Buceo',
        // Cycling
        'Ruta': 'Ciclismo Ruta', 'MTB XC': 'MTB Cross Country', 'MTB Downhill': 'MTB Downhill',
        'Pista': 'Pista', 'BMX': 'BMX', 'Triatlón': 'Triatlón', 'Duatlón': 'Duatlón', 'Gravel': 'Gravel',
        // Other
        'Golf': 'Golf', 'Escalada': 'Escalada', 'Gimnasia': 'Gimnasia', 'Voleibol': 'Voleibol',
        'Balonmano': 'Balonmano', 'Hockey': 'Hockey', 'Tiro con Arco': 'Tiro con Arco',
        'Skate': 'Skate', 'Esquí': 'Esquí', 'Snowboard': 'Snowboard', 'Hípica': 'Hípica'
    },
    ing: {
        // Athletics - Running
        '60m': '60m', '100m': '100m', '200m': '200m', '400m': '400m',
        '800m': '800m', '1500m': '1500m', '3000m': '3000m', '5000m': '5000m', '10000m': '10000m',
        'Media Maratón': 'Half Marathon', 'Maratón': 'Marathon', 'Ultramaratón': 'Ultramarathon',
        'Cross Country': 'Cross Country', 'Trail Running': 'Trail Running', 'Running': 'Running',
        // Athletics - Hurdles
        '60m Vallas': '60m Hurdles', '100m Vallas': '100m Hurdles', '110m Vallas': '110m Hurdles',
        '400m Vallas': '400m Hurdles', '3000m Obst.': '3000m Steeplechase',
        // Athletics - Jumps
        'Salto Longitud': 'Long Jump', 'Triple Salto': 'Triple Jump',
        'Salto Altura': 'High Jump', 'Pértiga': 'Pole Vault',
        // Athletics - Throws
        'Lanz. Peso': 'Shot Put', 'Lanz. Disco': 'Discus Throw',
        'Lanz. Jabalina': 'Javelin Throw', 'Lanz. Martillo': 'Hammer Throw',
        // Athletics - Combined/Other
        'Decatlón': 'Decathlon', 'Heptatlón': 'Heptathlon', 'Marcha': 'Race Walking', 'Relevos': 'Relays',
        // Gym
        'Powerlifting': 'Powerlifting', 'Bodybuilding': 'Bodybuilding', 'CrossFit': 'CrossFit',
        'Calistenia': 'Calisthenics', 'Strongman': 'Strongman', 'Halterofilia': 'Olympic Weightlifting',
        'Fitness General': 'General Fitness', 'Entrenamiento Funcional': 'Functional Training',
        'HIIT': 'HIIT', 'Street Lifting': 'Street Lifting', 'Kettlebell': 'Kettlebell',
        'Yoga/Pilates': 'Yoga/Pilates', 'Cardio': 'Cardio', 'Natural BB': 'Natural BB', 'Hyrox': 'Hyrox',
        // Soccer
        'Portero': 'Goalkeeper', 'Defensa': 'Defender', 'Lateral': 'Full-back', 'Carrilero': 'Wing-back',
        'Pivote': 'Defensive Mid', 'Interior': 'Central Mid', 'Mediapunta': 'Attacking Mid', 'Extremo': 'Winger',
        'Delantero': 'Striker', 'Fútbol Sala (Portero)': 'Futsal (Goalkeeper)',
        'Fútbol Sala (Jugador)': 'Futsal (Player)', 'Fútbol Sala': 'Futsal', 'Fútbol 7': '7-a-side',
        // Basketball
        'Base': 'Point Guard', 'Escolta': 'Shooting Guard', 'Alero': 'Small Forward',
        'Ala-Pívot': 'Power Forward', 'Pívot': 'Center', '3x3': '3x3',
        // Tennis/Padel
        'Tenis': 'Tennis', 'Pádel': 'Padel', 'Badminton': 'Badminton', 'Squash': 'Squash',
        'Tenis Mesa': 'Table Tennis', 'Pickleball': 'Pickleball', 'Frontón': 'Jai Alai',
        // Combat
        'Boxeo': 'Boxing', 'MMA': 'MMA', 'Muay Thai': 'Muay Thai', 'Kickboxing': 'Kickboxing',
        'Judo': 'Judo', 'BJJ': 'BJJ', 'Karate': 'Karate', 'Taekwondo': 'Taekwondo',
        'Lucha': 'Wrestling', 'Kung Fu': 'Kung Fu', 'Esgrima': 'Fencing',
        // Baseball
        'Pitcher': 'Pitcher', 'Catcher': 'Catcher', 'Shortstop': 'Shortstop',
        'Outfielder': 'Outfielder', 'Bateador': 'Hitter', 'Softbol': 'Softball',
        // Rugby/Football
        'Rugby Forward': 'Rugby Forward', 'Rugby Back': 'Rugby Back', 'Rugby 7s': 'Rugby 7s',
        'QB': 'Quarterback', 'Running Back': 'Running Back', 'Receiver': 'Receiver',
        'Lineman': 'Lineman', 'Linebacker': 'Linebacker', 'Defensive Back': 'Defensive Back', 'Kicker': 'Kicker',
        // Water Sports
        'Natación': 'Swimming', 'Aguas Abiertas': 'Open Water', 'Waterpolo': 'Water Polo',
        'Sincronizada': 'Artistic Swimming', 'Saltos': 'Diving', 'Surf': 'Surfing',
        'Remo': 'Rowing', 'Piragüismo': 'Canoeing/Kayaking', 'Kitesurf': 'Kitesurfing', 'Windsurf': 'Windsurfing',
        'Paddle Surf': 'Paddle Boarding', 'Vela': 'Sailing', 'Buceo': 'Scuba Diving',
        // Cycling
        'Ruta': 'Road Cycling', 'MTB XC': 'MTB Cross Country', 'MTB Downhill': 'MTB Downhill',
        'Pista': 'Track Cycling', 'BMX': 'BMX', 'Triatlón': 'Triathlon', 'Duatlón': 'Duathlon', 'Gravel': 'Gravel',
        // Other
        'Golf': 'Golf', 'Escalada': 'Climbing', 'Gimnasia': 'Gymnastics', 'Voleibol': 'Volleyball',
        'Balonmano': 'Handball', 'Hockey': 'Hockey', 'Tiro con Arco': 'Archery',
        'Skate': 'Skateboarding', 'Esquí': 'Skiing', 'Snowboard': 'Snowboarding', 'Hípica': 'Equestrian'
    },
    eus: {
        // Athletics - Running
        '60m': '60m', '100m': '100m', '200m': '200m', '400m': '400m',
        '800m': '800m', '1500m': '1500m', '3000m': '3000m', '5000m': '5000m', '10000m': '10000m',
        'Media Maratón': 'Erdi Maratoia', 'Maratón': 'Maratoia', 'Ultramaratón': 'Ultramaratoia',
        'Cross Country': 'Cross Country', 'Trail Running': 'Trail Running', 'Running': 'Korrika',
        // Athletics - Hurdles
        '60m Vallas': '60m Hesiak', '100m Vallas': '100m Hesiak', '110m Vallas': '110m Hesiak',
        '400m Vallas': '400m Hesiak', '3000m Obst.': '3000m Oztopoak',
        // Athletics - Jumps
        'Salto Longitud': 'Luzera Jauzia', 'Triple Salto': 'Jauzi Hirukoitza',
        'Salto Altura': 'Altuera Jauzia', 'Pértiga': 'Pertika',
        // Athletics - Throws
        'Lanz. Peso': 'Bola Jaurtiketa', 'Lanz. Disco': 'Disko Jaurtiketa',
        'Lanz. Jabalina': 'Jabalina Jaurtiketa', 'Lanz. Martillo': 'Mailu Jaurtiketa',
        // Athletics - Combined/Other
        'Decatlón': 'Dekatloia', 'Heptatlón': 'Heptatloia', 'Marcha': 'Ibilera', 'Relevos': 'Errelebo',
        // Gym
        'Powerlifting': 'Powerlifting', 'Bodybuilding': 'Kulturismo', 'CrossFit': 'CrossFit',
        'Calistenia': 'Kalistenia', 'Strongman': 'Strongman', 'Halterofilia': 'Halterofilia',
        'Fitness General': 'Fitness Orokorra', 'Entrenamiento Funcional': 'Entrenamendu Funtzionala',
        'HIIT': 'HIIT', 'Street Lifting': 'Street Lifting', 'Kettlebell': 'Kettlebell',
        'Yoga/Pilates': 'Yoga/Pilates', 'Cardio': 'Kardioa', 'Natural BB': 'Natural BB', 'Hyrox': 'Hyrox',
        // Soccer
        'Portero': 'Atezaina', 'Defensa': 'Defentsa', 'Lateral': 'Laterala', 'Carrilero': 'Hegala',
        'Pivote': 'Pibot', 'Interior': 'Erdilaria', 'Mediapunta': 'Mediapunta', 'Extremo': 'Muturreko',
        'Delantero': 'Aurrelaria', 'Fútbol Sala (Portero)': 'Areto Futbola (Atezaina)',
        'Fútbol Sala (Jugador)': 'Areto Futbola (Jokalaria)', 'Fútbol Sala': 'Areto Futbola', 'Fútbol 7': 'Futbol 7',
        // Basketball
        'Base': 'Base', 'Escolta': 'Eskolta', 'Alero': 'Alero', 'Ala-Pívot': 'Ala-Pibot', 'Pívot': 'Pibot', '3x3': '3x3',
        // Tennis/Padel
        'Tenis': 'Tenisa', 'Pádel': 'Padela', 'Badminton': 'Badmintona', 'Squash': 'Squash',
        'Tenis Mesa': 'Mahai Tenisa', 'Pickleball': 'Pickleball', 'Frontón': 'Frontoia',
        // Combat
        'Boxeo': 'Boxeoa', 'MMA': 'MMA', 'Muay Thai': 'Muay Thai', 'Kickboxing': 'Kickboxing',
        'Judo': 'Judoa', 'BJJ': 'BJJ', 'Karate': 'Karatea', 'Taekwondo': 'Taekwondoa',
        'Lucha': 'Borroka', 'Kung Fu': 'Kung Fu', 'Esgrima': 'Esgrima',
        // Baseball
        'Pitcher': 'Pitcher', 'Catcher': 'Catcher', 'Shortstop': 'Shortstop',
        'Outfielder': 'Outfielder', 'Bateador': 'Bateatzailea', 'Softbol': 'Softbola',
        // Rugby/Football
        'Rugby Forward': 'Rugby Aurrera', 'Rugby Back': 'Rugby Atzera', 'Rugby 7s': 'Rugby 7s',
        'QB': 'Quarterback', 'Running Back': 'Running Back', 'Receiver': 'Hartzailea',
        'Lineman': 'Lineman', 'Linebacker': 'Linebacker', 'Defensive Back': 'Defensive Back', 'Kicker': 'Kicker',
        // Water Sports
        'Natación': 'Igeriketa', 'Aguas Abiertas': 'Ur Irekiak', 'Waterpolo': 'Waterpolo',
        'Sincronizada': 'Igeri Sinkronizatua', 'Saltos': 'Jauziak', 'Surf': 'Surfa',
        'Remo': 'Arrauna', 'Piragüismo': 'Piragüismoa', 'Kitesurf': 'Kitesurfa', 'Windsurf': 'Windsurfa',
        'Paddle Surf': 'Paddle Surfa', 'Vela': 'Bela', 'Buceo': 'Urpekaritza',
        // Cycling
        'Ruta': 'Errepide Txirrindularitza', 'MTB XC': 'MTB Cross Country', 'MTB Downhill': 'MTB Downhill',
        'Pista': 'Pista', 'BMX': 'BMX', 'Triatlón': 'Triatloia', 'Duatlón': 'Duatloia', 'Gravel': 'Gravel',
        // Other
        'Golf': 'Golfa', 'Escalada': 'Eskalada', 'Gimnasia': 'Gimnasia', 'Voleibol': 'Boleibola',
        'Balonmano': 'Eskubaloia', 'Hockey': 'Hockeya', 'Tiro con Arco': 'Arku Tiroa',
        'Skate': 'Skatea', 'Esquí': 'Eskia', 'Snowboard': 'Snowboarda', 'Hípica': 'Hipika'
    }
};

/**
 * Get translated discipline name for display.
 * Falls back to the original (Spanish) key if no translation exists.
 */
export const getTranslatedDiscipline = (discipline: string, language: string): string => {
    const lang = (language as Language) || 'es';
    const translations = DISCIPLINE_TRANSLATIONS[lang] || DISCIPLINE_TRANSLATIONS.es;
    return translations[discipline] || discipline;
};

/**
 * Get translated sport category name for display.
 */
export const getTranslatedSportCategory = (sportKey: string, language: string): string => {
    const lang = (language as Language) || 'es';
    const categories = SPORT_CATEGORIES[lang] || SPORT_CATEGORIES.es;
    return categories[sportKey] || sportKey;
};

/**
 * Translations for default strength exercises
 */
export const EXERCISE_TRANSLATIONS: Record<Language, Record<string, string>> = {
    es: {
        'Sentadilla': 'Sentadilla', 'Press Banca': 'Press Banca', 'Peso Muerto': 'Peso Muerto',
        'Cargada': 'Cargada', 'Salto Vertical': 'Salto Vertical', 'Lanz. Balón Med.': 'Lanz. Balón Med.',
        'Flexiones': 'Flexiones'
    },
    ing: {
        'Sentadilla': 'Squat', 'Press Banca': 'Bench Press', 'Peso Muerto': 'Deadlift',
        'Cargada': 'Power Clean', 'Salto Vertical': 'Vertical Jump', 'Lanz. Balón Med.': 'Med. Ball Throw',
        'Flexiones': 'Push-ups'
    },
    eus: {
        'Sentadilla': 'Makurtze', 'Press Banca': 'Banka Prentsa', 'Peso Muerto': 'Pisu Hilak',
        'Cargada': 'Karga', 'Salto Vertical': 'Jauzi Bertikala', 'Lanz. Balón Med.': 'Baloi Med. Jaurt.',
        'Flexiones': 'Besauliak'
    }
};

/**
 * Get translated exercise name for display.
 */
export const getTranslatedExercise = (exercise: string, language: string): string => {
    const lang = (language as Language) || 'es';
    const translations = EXERCISE_TRANSLATIONS[lang] || EXERCISE_TRANSLATIONS.es;
    return translations[exercise] || exercise;
};
