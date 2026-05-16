import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export const exportToImage = async (elementId: string, fileName: string) => {
  const element = document.getElementById(elementId);
  if (!element) return;

  const canvas = await html2canvas(element, {
    useCORS: true,
    scale: 2,
    logging: false,
  });

  const link = document.createElement('a');
  link.download = `${fileName}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
};

export const exportToPdf = async (elementId: string, fileName: string) => {
  const element = document.getElementById(elementId);
  if (!element) return;

  const canvas = await html2canvas(element, {
    useCORS: true,
    scale: 2,
    logging: false,
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({
    orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [canvas.width, canvas.height],
  });

  pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
  pdf.save(`${fileName}.pdf`);
};
