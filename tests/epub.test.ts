// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { parseEpub } from "@/lib/epub";
import { chunkSections } from "@/lib/chunk";

async function makeEpub() {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file("META-INF/container.xml",
    `<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
     <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  zip.file("OEBPS/content.opf",
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0">
     <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>The Salt Road</dc:title><dc:creator>A. Writer</dc:creator></metadata>
     <manifest>
       <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml"/>
       <item id="c1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
       <item id="c2" href="text/ch%202.xhtml" media-type="application/xhtml+xml"/>
       <item id="css" href="style.css" media-type="text/css"/>
     </manifest>
     <spine><itemref idref="c1"/><itemref idref="c2"/><itemref idref="css"/></spine></package>`);
  const page = (h: string, body: string) =>
    `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>x</title><style>p{}</style></head><body><h2>${h}</h2>${body}</body></html>`;
  zip.file("OEBPS/text/ch1.xhtml", page("One: The Harbour", "<p>Mara reached the <em>harbour</em> at dusk.</p><p>The ferry had gone.</p>"));
  zip.file("OEBPS/text/ch 2.xhtml", page("Two: The Lighthouse", "<div><p>She found the letter under the lamp.</p><script>bad()</script></div>"));
  return zip.generateAsync({ type: "uint8array" });
}

describe("parseEpub", () => {
  it("reads metadata and chapter text in reading order", async () => {
    const book = await parseEpub(await makeEpub());
    expect(book.title).toBe("The Salt Road");
    expect(book.author).toBe("A. Writer");
    expect(book.sections.map((s) => s.title)).toEqual(["One: The Harbour", "Two: The Lighthouse"]);
    expect(book.sections[0].text).toContain("Mara reached the harbour at dusk.\n\nThe ferry had gone.");
    expect(book.sections[1].text).toContain("letter under the lamp");
    expect(book.sections[1].text).not.toContain("bad()");
    const { chunks } = chunkSections(book.sections);
    expect(chunks).toHaveLength(2);
    expect(chunks[1].chapter).toBe("Two: The Lighthouse");
  });

  it("rejects a zip that is not an EPUB", async () => {
    const zip = new JSZip();
    zip.file("hello.txt", "hi");
    await expect(parseEpub(await zip.generateAsync({ type: "uint8array" }))).rejects.toThrow(/valid EPUB/);
  });
});
