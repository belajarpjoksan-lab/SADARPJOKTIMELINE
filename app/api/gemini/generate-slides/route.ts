import { Type } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { PresentationData, getFallbackPresentationData } from '@/lib/slide-presentation';
import { createGeminiClient, DEFAULT_GEMINI_MODEL, classifyGeminiError, logGeminiFallback } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  let namaGuru = 'Guru PJOK SD';
  let mapel = 'PJOK';
  let kelas = 'Kelas V';
  let sekolah = 'SD Negeri Kalimantong';
  let tujuanPembelajaran = 'Peserta didik dapat memahami dan mempraktikkan variasi gerak dasar menendang dan menghentikan bola secara terarah.';
  let jumlahSubmateri = 2;
  let temaWarna = 'teal';

  try {
    const body = await req.json();
    namaGuru = body.namaGuru || namaGuru;
    mapel = body.mapel || mapel;
    kelas = body.kelas || kelas;
    sekolah = body.sekolah || sekolah;
    tujuanPembelajaran = body.tujuanPembelajaran || tujuanPembelajaran;
    jumlahSubmateri = body.jumlahSubmateri ?? jumlahSubmateri;
    temaWarna = body.temaWarna || temaWarna;

    const ai = createGeminiClient();
    if (!ai) {
      return NextResponse.json({
        data: getFallbackPresentationData(namaGuru, mapel, kelas, sekolah, tujuanPembelajaran),
        isFallback: true,
        warning: 'GEMINI_API_KEY belum diatur. Slide disusun menggunakan Mode Template otomatis.',
      });
    }

    const systemInstruction = `Anda adalah seorang desainer kurikulum dan spesialis presentasi pembelajaran interaktif Canva & PowerPoint profesional.
Tugas Anda adalah merancang bahan ajar slide presentasi interaktif lengkap dalam Bahasa Indonesia berdasarkan prompt dan tujuan pembelajaran guru.

STRUKTUR WAJIB SLIDE:
1. Slide Judul: Judul materi, nama guru, sekolah, mata pelajaran, kelas. Desain menarik dan profesional.
2. Slide Pemantik (Hook): Pertanyaan atau situasi memancing rasa ingin tahu murid.
3. Slide Tujuan Pembelajaran: Poin jelas dan komunikatif.
4. Slide Materi Lengkap:
   - Bagi materi menjadi ${jumlahSubmateri || 2} submateri.
   - Buat 5-6 slide untuk SETIAP submateri (konsep dasar, langkah teknik/rincian, poin kunci, contoh visual/ilustrasi Canva, latihan singkat/mini aktivitas, cek pemahaman).
5. Slide Refleksi: 2-3 pertanyaan refleksi kritis terbuka (misal: "Apa hal baru yang kamu pelajari?", "Bagaimana menerapkannya dalam kehidupan sehari-hari?").
6. Slide Kesimpulan: Rangkuman poin penting dalam bullet point singkat dan padat.
7. Slide Penutup: Pesan motivasi atau kutipan inspiratif, ucapan terima kasih, dan ajakan terus belajar.

Setiap slide harus menyertakan:
- visualIdea: Deskripsi instruksi elemen visual untuk Canva (misal: "Ilustrasi 3D bola sepak, shape lengkung pastel, infografis 3 pilar").
- canvaKeywordTag: Kata kunci pencarian elemen/grafis di Canva (misal: "kids sport illustration, soccer ball 3d, classroom infographic").
- speakerNotes: Catatan narasi guru saat menerangkan slide.`;

    const userPrompt = `Saya ${namaGuru} yang mengajar Mapel ${mapel} kelas ${kelas} di ${sekolah} akan menyusun bahan ajar.
Buatkan presentasi PowerPoint & Canva pembelajaran interaktif berdasarkan tujuan pembelajaran berikut:
"${tujuanPembelajaran}"

Rancang seluruh slide lengkap dengan bahasa Indonesia yang hangat, komunikatif, dan sesuai jenjang ${kelas}. Pastikan setiap submateri memiliki 5-6 slide yang padat dan runtut.`;

    const response = await ai.models.generateContent({
      model: DEFAULT_GEMINI_MODEL,
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            guru: { type: Type.STRING },
            mapel: { type: Type.STRING },
            kelas: { type: Type.STRING },
            sekolah: { type: Type.STRING },
            tujuanPembelajaran: { type: Type.STRING },
            judulMateri: { type: Type.STRING },
            temaWarna: { type: Type.STRING },
            totalSlides: { type: Type.INTEGER },
            slides: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.INTEGER },
                  type: { type: Type.STRING },
                  submateriTag: { type: Type.STRING },
                  title: { type: Type.STRING },
                  subtitle: { type: Type.STRING },
                  bullets: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  keyConcept: { type: Type.STRING },
                  questionPrompt: { type: Type.STRING },
                  activityBox: {
                    type: Type.OBJECT,
                    properties: {
                      instruction: { type: Type.STRING },
                      duration: { type: Type.STRING },
                    },
                  },
                  visualIdea: { type: Type.STRING },
                  canvaKeywordTag: { type: Type.STRING },
                  speakerNotes: { type: Type.STRING },
                },
                required: ['id', 'type', 'title', 'visualIdea', 'canvaKeywordTag', 'speakerNotes'],
              },
            },
          },
          required: ['guru', 'mapel', 'kelas', 'sekolah', 'judulMateri', 'slides'],
        },
      },
    });

    const outputText = response.text || '{}';
    let parsed: Partial<PresentationData> = {};
    try {
      parsed = JSON.parse(outputText);
    } catch {
      const match = outputText.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      }
    }

    const fallback = getFallbackPresentationData(namaGuru, mapel, kelas, sekolah, tujuanPembelajaran);
    const finalData: PresentationData = {
      guru: parsed.guru || namaGuru,
      mapel: parsed.mapel || mapel,
      kelas: parsed.kelas || kelas,
      sekolah: parsed.sekolah || sekolah,
      tujuanPembelajaran: parsed.tujuanPembelajaran || tujuanPembelajaran,
      judulMateri: parsed.judulMateri || fallback.judulMateri,
      temaWarna: (parsed.temaWarna as 'teal' | 'ocean' | 'sunset' | 'purple' | 'emerald') || temaWarna,
      totalSlides: parsed.slides?.length || fallback.totalSlides,
      slides: parsed.slides && parsed.slides.length >= 6 ? parsed.slides : fallback.slides,
    };

    return NextResponse.json({
      data: finalData,
      isFallback: false,
    });
  } catch (err: unknown) {
    const errInfo = classifyGeminiError(err);
    logGeminiFallback('Slide Presentasi', errInfo);
    return NextResponse.json({
      data: getFallbackPresentationData(namaGuru, mapel, kelas, sekolah, tujuanPembelajaran),
      isFallback: true,
      errorCode: errInfo.code,
      warning: errInfo.userMessage,
    });
  }
}
