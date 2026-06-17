import { Document, Packer, Paragraph, ImageRun, TextRun, HeadingLevel } from 'docx';
import fs from 'fs';
import path from 'path';

const dir = 'C:\\Users\\adneo\\OneDrive\\바탕 화면\\test';

const sections = [
  { title: '1. 상가 기준시가 (국세청 홈택스)', file: '111_1_기준시가.png' },
  { title: '2. 매각가율 (법원경매정보 - 부산 강서구)', file: '111_2_매각가율.png' },
  { title: '3. 사업자등록상태 (사업자번호: 482-31-00133)', file: '111_3_사업자상태.png' },
  { title: '4. 토지이용계획 (부산 강서구 명지동 3232)', file: '111_4_토지이용계획.png' },
  { title: '4. 건축물정보 (부산 강서구 명지동 3232)', file: '111_4_건축물정보.png' },
  { title: '5. 지가변동률 (한국부동산원 - 부산 강서구)', file: '111_5_지가변동률.png' },
  { title: '6. 개별공시지가 (부산 강서구 명지동 3232)', file: '111_6_공시지가.png' },
];

const children = [];

for (const sec of sections) {
  children.push(new Paragraph({
    text: sec.title,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 400, after: 200 },
  }));

  const imgPath = path.join(dir, sec.file);
  const imgData = fs.readFileSync(imgPath);

  children.push(new Paragraph({
    children: [
      new ImageRun({
        data: imgData,
        transformation: { width: 600, height: 400 },
      }),
    ],
    spacing: { after: 400 },
  }));
}

const doc = new Document({
  sections: [{ children }],
});

const buf = await Packer.toBuffer(doc);
fs.writeFileSync(path.join(dir, '111.docx'), buf);
console.log('111.docx created');
