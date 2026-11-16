import { Type } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import {
  AsesmenSumatifData,
  DEFAULT_KOMPOSISI_SOAL,
  alignAsesmenWithKomposisi,
  computeKomposisiSummary,
  formatPgOpsiLabel,
  getFallbackSoalV2Data,
  normalizeKomposisiSoal,
} from '@/lib/asesmen-sumatif-types';
import { createGeminiClient, DEFAULT_GEMINI_MODEL, classifyGeminiError, logGeminiFallback } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  let mapel = 'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)';
  let kelas = 'Kelas V';
  let fase = 'Fase C';
  let semester = 'Ganjil';
  let jenisAsesmen = 'Asesmen Sumatif Akhir Semester (SAS)';
  let namaSekolah = 'SD NEGERI KALIMANTONG';
  let tahunPelajaran = '2026/2027';
  let alokasiWaktu = '90 Menit';
  let tujuanPembelajaran = `1. Mempraktikkan dan menganalisis variasi serta kombinasi pola gerak dasar passing dan shooting dalam permainan sepak bola.
2. Menganalisis dan mempraktikkan variasi gerak passing bawah dan passing atas dalam permainan bola voli.
3. Menerapkan dan mengevaluasi aktivitas latihan peningkatan kebugaran jasmani (daya tahan jantung dan kekuatan otot).
4. Menunjukkan sikap sportivitas, gotong royong, disiplin, dan tanggung jawab selama beraktivitas jasmani.`;
  let komposisi = { ...DEFAULT_KOMPOSISI_SOAL };
  let instruksiKhusus = '';

  try {
    const body = await req.json();
    mapel = body.mapel || mapel;
    kelas = body.kelas || kelas;
    fase = body.fase || fase;
    semester = body.semester || semester;
    jenisAsesmen = body.jenisAsesmen || jenisAsesmen;
    namaSekolah = body.namaSekolah || namaSekolah;
    tahunPelajaran = body.tahunPelajaran || tahunPelajaran;
    alokasiWaktu = body.alokasiWaktu || alokasiWaktu;
    tujuanPembelajaran = body.tujuanPembelajaran || tujuanPembelajaran;
    instruksiKhusus = typeof body.instruksiKhusus === 'string' ? body.instruksiKhusus.trim() : '';
    komposisi = normalizeKomposisiSoal(body.komposisi);

    const summary = computeKomposisiSummary(komposisi);
    const ai = createGeminiClient();
    if (!ai) {
      const fb = getFallbackSoalV2Data(
        mapel,
        kelas,
        fase,
        jenisAsesmen,
        tujuanPembelajaran,
        komposisi,
        instruksiKhusus
      );
      fb.identitas.namaSekolah = namaSekolah;
      fb.identitas.semester = semester;
      fb.identitas.tahunPelajaran = tahunPelajaran;
      fb.identitas.alokasiWaktu = alokasiWaktu;
      return NextResponse.json({
        data: fb,
        isFallback: true,
        warning: 'Mode Template Cerdas aktif: soal disusun langsung menyesuaikan Tujuan Pembelajaran dan perintah Anda.',
      });
    }

    const opsiPgLabel = formatPgOpsiLabel(komposisi.opsiPg);
    const pgPilihanSchemaProperties = Object.fromEntries(
      summary.allowedPgKeys.map((key) => [key, { type: Type.STRING }])
    );
    const komposisiLines = [
      komposisi.pg > 0
        ? `- Soal Pilihan Ganda (PG): ${komposisi.pg} nomor (Nomor ${summary.pg.start}–${summary.pg.end}) dengan ${komposisi.opsiPg} pilihan jawaban (${opsiPgLabel}), kunci jawaban WAJIB hanya memilih dari (${opsiPgLabel}), bobot 1 poin/soal.`
        : `- Soal Pilihan Ganda (PG): 0 nomor (kosongkan array soalPilihanGanda).`,
      komposisi.pgKompleks > 0
        ? `- Soal Pilihan Ganda Kompleks: ${komposisi.pgKompleks} nomor (Nomor ${summary.pgKompleks.start}–${summary.pgKompleks.end}) dengan 5 pilihan jawaban (A, B, C, D, E), bobot 2 poin/soal.`
        : `- Soal Pilihan Ganda Kompleks: 0 nomor (kosongkan array soalPgKompleks).`,
      komposisi.menjodohkan > 0
        ? `- Soal Menjodohkan: ${komposisi.menjodohkan} nomor (Nomor ${summary.menjodohkan.start}–${summary.menjodohkan.end}), bobot 1 poin/soal.`
        : `- Soal Menjodohkan: 0 nomor (kosongkan array soalMenjodohkan).`,
      komposisi.isianSingkat > 0
        ? `- Soal Isian Singkat: ${komposisi.isianSingkat} nomor (Nomor ${summary.isianSingkat.start}–${summary.isianSingkat.end}), tingkat kesukaran sedang hingga tinggi, bobot 2 poin/soal.`
        : `- Soal Isian Singkat: 0 nomor (kosongkan array soalIsianSingkat).`,
      komposisi.uraian > 0
        ? `- Soal Isian Uraian: ${komposisi.uraian} nomor (Nomor ${summary.uraian.start}–${summary.uraian.end}), tingkat kesukaran sedang hingga tinggi, bobot 5 poin/soal.`
        : `- Soal Isian Uraian: 0 nomor (kosongkan array soalUraian).`,
    ].join('\n   ');

    const systemInstruction = `Anda adalah Guru mata pelajaran ${mapel} kelas ${kelas} fase ${fase} yang sedang menyusun soal asesmen sumatif resmi sekolah (${jenisAsesmen}).
Asesmen sumatif digunakan untuk mengukur ketercapaian kompetensi peserta didik secara menyeluruh pada akhir periode pembelajaran berdasarkan semua tujuan pembelajaran yang diujikan.

INSTRUKSI WAJIB:
1. Buatkan kisi-kisi asesmen sumatif yang memetakan ketercapaian SEMUA TUJUAN PEMBELAJARAN yang diujikan secara rinci tiap nomor soal (${summary.totalSoal} baris) dalam bentuk tabel dengan format:
   | No | Tujuan Pembelajaran | Ruang Lingkup Materi | Level Kognitif (Taksonomi Bloom) | Indikator Soal | Bentuk Soal | Nomor Soal | Naskah Soal | Kunci Jawaban | Skor |

2. Komposisi Soal (Total TEPAT ${summary.totalSoal} butir):
   ${komposisiLines}

3. Ketentuan Stimulus Soal:
   - Sertakan soal-soal yang memiliki stimulus berupa bacaan singkat kontekstual yang sesuai dengan pertanyaan.
   - Sertakan soal-soal berbasis gambar (diagram, bagan, grafik, atau ilustrasi). Gunakan format teks:
     [Gambar: "Deskripsikan detail gambar yang harus disiapkan oleh guru"] diatas teks pertanyaan soal.
   - Jika ada stimulus dalam bentuk tabel, sertakan tabel stimulus secara rapi (headers & rows).

4. Lembar Soal Asesmen Sumatif:
   - Identitas soal (nama sekolah, mata pelajaran, kelas/semester, tahun pelajaran, alokasi waktu, jumlah soal = ${summary.totalSoal}, tujuan pembelajaran yang diujikan).
   - Petunjuk pengerjaan (umum & khusus).
   - Naskah soal tersusun rapi per bagian sesuai komposisi jumlah soal.

5. Tabel Kunci Jawaban dan Pedoman Penskoran:
   - Kunci jawaban lengkap tiap nomor dan skor.
   - Skor maksimal: PG = ${summary.skorPg}, PG Kompleks = ${summary.skorPgKompleks}, Menjodohkan = ${summary.skorMenjodohkan}, Isian = ${summary.skorIsian}, Uraian = ${summary.skorUraian} (Total = ${summary.totalSkor}).
   - Rumus Nilai Akhir: (Total Skor Perolehan / ${summary.totalSkor}) x 100.

6. ATURAN KETAT KESESUAIAN PERINTAH:
   - 100% seluruh butir soal, stimulus, pilihan jawaban, kunci, dan kisi-kisi WAJIB berasal secara eksklusif dari Mata Pelajaran, Kelas/Fase, Tujuan Pembelajaran, serta Instruksi Khusus yang diperintahkan pengguna.
   - DILARANG menyisipkan topik lain di luar Tujuan Pembelajaran yang diinputkan.`;

    const userPrompt = `Buatkan Asesmen Sumatif (${summary.totalSoal} soal) Berdasarkan Perintah & Rincian Tujuan Pembelajaran Berikut:
Mata Pelajaran: ${mapel}
Kelas / Fase: ${kelas} / ${fase}
Semester: ${semester}
Jenis Asesmen: ${jenisAsesmen}
Nama Sekolah: ${namaSekolah}
Tahun Pelajaran: ${tahunPelajaran}
Alokasi Waktu: ${alokasiWaktu}
Komposisi Jumlah Soal: PG=${komposisi.pg} (${komposisi.opsiPg} opsi: ${opsiPgLabel}), PG Kompleks=${komposisi.pgKompleks}, Menjodohkan=${komposisi.menjodohkan}, Isian Singkat=${komposisi.isianSingkat}, Uraian=${komposisi.uraian}
Tujuan Pembelajaran yang Diujikan:
${tujuanPembelajaran}
${instruksiKhusus ? `\nPerintah / Instruksi Khusus Guru:\n${instruksiKhusus}` : ''}
`;

    const response = await ai.models.generateContent({
      model: DEFAULT_GEMINI_MODEL,
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            identitas: {
              type: Type.OBJECT,
              properties: {
                namaSekolah: { type: Type.STRING },
                mataPelajaran: { type: Type.STRING },
                kelas: { type: Type.STRING },
                fase: { type: Type.STRING },
                semester: { type: Type.STRING },
                jenisAsesmen: { type: Type.STRING },
                tahunPelajaran: { type: Type.STRING },
                alokasiWaktu: { type: Type.STRING },
                jumlahSoal: { type: Type.INTEGER },
                tujuanPembelajaran: { type: Type.STRING },
                materiDanSubmateri: { type: Type.STRING },
              },
              required: ['namaSekolah', 'mataPelajaran', 'kelas', 'fase', 'semester', 'jenisAsesmen', 'tahunPelajaran', 'alokasiWaktu', 'jumlahSoal'],
            },
            petunjukUmum: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            soalPilihanGanda: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  nomor: { type: Type.INTEGER },
                  stimulus: { type: Type.STRING },
                  deskripsiGambar: { type: Type.STRING },
                  tabelStimulus: {
                    type: Type.OBJECT,
                    properties: {
                      headers: { type: Type.ARRAY, items: { type: Type.STRING } },
                      rows: {
                        type: Type.ARRAY,
                        items: { type: Type.ARRAY, items: { type: Type.STRING } },
                      },
                    },
                  },
                  pertanyaan: { type: Type.STRING },
                  pilihan: {
                    type: Type.OBJECT,
                    properties: pgPilihanSchemaProperties,
                    required: summary.allowedPgKeys,
                  },
                  kunci: { type: Type.STRING },
                  levelBloom: { type: Type.STRING },
                  skor: { type: Type.INTEGER },
                },
                required: ['nomor', 'pertanyaan', 'pilihan', 'kunci', 'levelBloom', 'skor'],
              },
            },
            soalPgKompleks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  nomor: { type: Type.INTEGER },
                  stimulus: { type: Type.STRING },
                  deskripsiGambar: { type: Type.STRING },
                  pertanyaan: { type: Type.STRING },
                  pilihan: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        kode: { type: Type.STRING },
                        teks: { type: Type.STRING },
                        isBenar: { type: Type.BOOLEAN },
                      },
                      required: ['kode', 'teks'],
                    },
                  },
                  kunci: { type: Type.STRING },
                  levelBloom: { type: Type.STRING },
                  skor: { type: Type.INTEGER },
                },
                required: ['nomor', 'pertanyaan', 'pilihan', 'kunci', 'levelBloom', 'skor'],
              },
            },
            soalMenjodohkan: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  nomor: { type: Type.INTEGER },
                  premisKiri: { type: Type.STRING },
                  responsKanan: { type: Type.STRING },
                  kunci: { type: Type.STRING },
                  skor: { type: Type.INTEGER },
                },
                required: ['nomor', 'premisKiri', 'responsKanan', 'kunci', 'skor'],
              },
            },
            soalIsianSingkat: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  nomor: { type: Type.INTEGER },
                  stimulus: { type: Type.STRING },
                  deskripsiGambar: { type: Type.STRING },
                  pertanyaan: { type: Type.STRING },
                  kunci: { type: Type.STRING },
                  levelBloom: { type: Type.STRING },
                  skor: { type: Type.INTEGER },
                },
                required: ['nomor', 'pertanyaan', 'kunci', 'levelBloom', 'skor'],
              },
            },
            soalUraian: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  nomor: { type: Type.INTEGER },
                  stimulus: { type: Type.STRING },
                  deskripsiGambar: { type: Type.STRING },
                  pertanyaan: { type: Type.STRING },
                  rubrikDanKunci: { type: Type.STRING },
                  levelBloom: { type: Type.STRING },
                  skor: { type: Type.INTEGER },
                },
                required: ['nomor', 'pertanyaan', 'rubrikDanKunci', 'levelBloom', 'skor'],
              },
            },
            kisiKisiTabel: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  no: { type: Type.INTEGER },
                  tujuanPembelajaran: { type: Type.STRING },
                  ruangLingkupMateri: { type: Type.STRING },
                  levelKognitif: { type: Type.STRING },
                  indikatorSoal: { type: Type.STRING },
                  bentukSoal: { type: Type.STRING },
                  nomorSoal: { type: Type.INTEGER },
                  naskahSoal: { type: Type.STRING },
                  kunciJawaban: { type: Type.STRING },
                  skor: { type: Type.INTEGER },
                },
                required: ['no', 'tujuanPembelajaran', 'ruangLingkupMateri', 'levelKognitif', 'indikatorSoal', 'bentukSoal', 'nomorSoal', 'naskahSoal', 'kunciJawaban', 'skor'],
              },
            },
            pedomanPenskoran: {
              type: Type.OBJECT,
              properties: {
                skorMaksimalPg: { type: Type.INTEGER },
                skorMaksimalPgKompleks: { type: Type.INTEGER },
                skorMaksimalMenjodohkan: { type: Type.INTEGER },
                skorMaksimalIsian: { type: Type.INTEGER },
                skorMaksimalUraian: { type: Type.INTEGER },
                totalSkorMaksimal: { type: Type.INTEGER },
                rumusNilaiAkhir: { type: Type.STRING },
              },
              required: ['skorMaksimalPg', 'skorMaksimalPgKompleks', 'skorMaksimalMenjodohkan', 'skorMaksimalIsian', 'skorMaksimalUraian', 'totalSkorMaksimal', 'rumusNilaiAkhir'],
            },
          },
          required: [
            'identitas',
            'petunjukUmum',
            'soalPilihanGanda',
            'soalPgKompleks',
            'soalMenjodohkan',
            'soalIsianSingkat',
            'soalUraian',
            'kisiKisiTabel',
            'pedomanPenskoran',
          ],
        },
      },
    });

    const fallback = getFallbackSoalV2Data(
      mapel,
      kelas,
      fase,
      jenisAsesmen,
      tujuanPembelajaran,
      komposisi,
      instruksiKhusus
    );
    const parsedData: Partial<AsesmenSumatifData> = JSON.parse(response.text || '{}');
    if (!parsedData.identitas) {
      fallback.identitas.namaSekolah = namaSekolah;
      fallback.identitas.semester = semester;
      fallback.identitas.tahunPelajaran = tahunPelajaran;
      fallback.identitas.alokasiWaktu = alokasiWaktu;
      return NextResponse.json({
        data: fallback,
        isFallback: true,
      });
    }

    const aligned = alignAsesmenWithKomposisi(parsedData, komposisi, fallback);
    aligned.identitas.namaSekolah = namaSekolah || aligned.identitas.namaSekolah;
    aligned.identitas.mataPelajaran = mapel || aligned.identitas.mataPelajaran;
    aligned.identitas.kelas = kelas || aligned.identitas.kelas;
    aligned.identitas.fase = fase || aligned.identitas.fase;
    aligned.identitas.semester = semester || aligned.identitas.semester;
    aligned.identitas.jenisAsesmen = jenisAsesmen || aligned.identitas.jenisAsesmen;
    aligned.identitas.tahunPelajaran = tahunPelajaran || aligned.identitas.tahunPelajaran;
    aligned.identitas.alokasiWaktu = alokasiWaktu || aligned.identitas.alokasiWaktu;
    aligned.identitas.tujuanPembelajaran = tujuanPembelajaran;
    if (instruksiKhusus) {
      aligned.identitas.instruksiKhusus = instruksiKhusus;
    }

    return NextResponse.json({
      data: aligned,
      isFallback: false,
    });
  } catch (error) {
    const errInfo = classifyGeminiError(error);
    logGeminiFallback('Soal V2', errInfo);
    const fallback = getFallbackSoalV2Data(
      mapel,
      kelas,
      fase,
      jenisAsesmen,
      tujuanPembelajaran,
      komposisi,
      instruksiKhusus
    );
    fallback.identitas.namaSekolah = namaSekolah;
    fallback.identitas.semester = semester;
    fallback.identitas.tahunPelajaran = tahunPelajaran;
    fallback.identitas.alokasiWaktu = alokasiWaktu;
    return NextResponse.json({
      data: fallback,
      isFallback: true,
      errorCode: errInfo.code,
      warning: errInfo.userMessage,
    });
  }
}
