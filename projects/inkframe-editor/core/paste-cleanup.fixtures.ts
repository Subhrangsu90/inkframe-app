/**
 * Clipboard HTML fixtures for paste cleanup tests.
 *
 * These are reconstructions of the `text/html` clipboard format each source
 * produces (Word's CF_HTML document with Office namespaces and
 * `mso-list` paragraphs, Google Docs' `docs-internal-guid` wrapper with fully
 * inlined styles, and Chrome's computed-style copy from a web page), not
 * captures from a live clipboard. Replace or extend them with real captures
 * (`event.clipboardData.getData('text/html')` in a paste handler) when they
 * disagree with what the applications produce today.
 */

/** Microsoft Word 365 (Windows) copied into Chrome. */
export const WORD_CLIPBOARD = `<html xmlns:v="urn:schemas-microsoft-com:vml"
xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns:m="http://schemas.microsoft.com/office/2004/12/omml"
xmlns="http://www.w3.org/TR/REC-html40">

<head>
<meta http-equiv=Content-Type content="text/html; charset=utf-8">
<meta name=ProgId content=Word.Document>
<meta name=Generator content="Microsoft Word 15">
<meta name=Originator content="Microsoft Word 15">
<link rel=File-List
href="file:///C:/Users/writer/AppData/Local/Temp/msohtmlclip1/01/clip_filelist.xml">
<!--[if gte mso 9]><xml>
 <o:OfficeDocumentSettings>
  <o:AllowPNG/>
 </o:OfficeDocumentSettings>
</xml><![endif]-->
<style>
<!--
 /* Font Definitions */
 @font-face
	{font-family:"Cambria Math";
	panose-1:2 4 5 3 5 4 6 3 2 4;}
p.MsoNormal, li.MsoNormal, div.MsoNormal
	{margin-top:0in;
	margin-bottom:8.0pt;
	line-height:107%;
	font-size:11.0pt;
	font-family:"Calibri",sans-serif;}
@list l0:level1
	{mso-level-number-format:bullet;
	mso-level-text:\\F0B7;
	font-family:Symbol;}
-->
</style>
</head>

<body lang=EN-US style='tab-interval:.5in;word-wrap:break-word'>
<!--StartFragment-->

<p class=MsoTitle>Quarterly report<o:p></o:p></p>

<p class=MsoNormal align=center style='text-align:center'><span
style='color:windowtext'>Prepared for the </span><b><span style='color:#C00000'>board</span></b><span
style='color:windowtext'>.<o:p></o:p></span></p>

<p class=MsoNormal><b>Bold</b>, <i>italic</i>, <u>underlined</u> and <span
style='background:yellow;mso-highlight:yellow'>highlighted</span> text.<o:p></o:p></p>

<p class=MsoNormal><o:p>&nbsp;</o:p></p>

<p class=MsoListParagraphCxSpFirst style='text-indent:-.25in;mso-list:l0 level1 lfo1'><![if !supportLists]><span
style='font-family:Symbol;mso-fareast-font-family:Symbol;mso-bidi-font-family:
Symbol'><span style='mso-list:Ignore'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
</span></span></span><![endif]>First point<o:p></o:p></p>

<p class=MsoListParagraphCxSpMiddle style='margin-left:1.0in;mso-add-space:
auto;text-indent:-.25in;mso-list:l0 level2 lfo1'><![if !supportLists]><span
style='font-family:"Courier New";mso-fareast-font-family:"Courier New"'><span
style='mso-list:Ignore'>o<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;
</span></span></span><![endif]>A detail<o:p></o:p></p>

<p class=MsoListParagraphCxSpLast style='text-indent:-.25in;mso-list:l0 level1 lfo1'><![if !supportLists]><span
style='font-family:Symbol;mso-fareast-font-family:Symbol;mso-bidi-font-family:
Symbol'><span style='mso-list:Ignore'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
</span></span></span><![endif]>Second point<o:p></o:p></p>

<p class=MsoListParagraphCxSpFirst style='text-indent:-.25in;mso-list:l1 level1 lfo2'><![if !supportLists]><span
style='mso-fareast-font-family:Calibri;mso-bidi-font-family:Calibri'><span
style='mso-list:Ignore'>1.<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
</span></span></span><![endif]>Step one<o:p></o:p></p>

<p class=MsoListParagraphCxSpLast style='text-indent:-.25in;mso-list:l1 level1 lfo2'><![if !supportLists]><span
style='mso-fareast-font-family:Calibri;mso-bidi-font-family:Calibri'><span
style='mso-list:Ignore'>2.<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
</span></span></span><![endif]>Step two<o:p></o:p></p>

<h2>Next steps<o:p></o:p></h2>

<p class=MsoNormal>Read the <a href="https://example.com/plan"><span
style='color:#0563C1'>full plan</span></a> and compare H<sub>2</sub>O with x<sup>2</sup>.<o:p></o:p></p>

<p class=MsoNormal><span style='mso-no-proof:yes'><!--[if gte vml 1]><v:shape
 id="Picture_x0020_1" o:spid="_x0000_i1025" type="#_x0000_t75" style='width:90pt;height:60pt;visibility:visible'>
 <v:imagedata src="file:///C:/Users/writer/AppData/Local/Temp/msohtmlclip1/01/clip_image001.png" o:title=""/>
</v:shape><![endif]--><![if !vml]><img width=120 height=80
src="file:///C:/Users/writer/AppData/Local/Temp/msohtmlclip1/01/clip_image002.png" v:shapes="Picture_x0020_1"><![endif]></span><o:p></o:p></p>

<!--EndFragment-->
</body>

</html>`;

const GDOCS_SPAN =
  'font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;';
const span = (text: string, style = GDOCS_SPAN) => `<span style="${style}">${text}</span>`;
const GDOCS_P = 'line-height:1.38;margin-top:0pt;margin-bottom:0pt;';
const GDOCS_LI =
  'list-style-type:disc;font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;';
const GDOCS_UL = 'margin-top:0;margin-bottom:0;padding-inline-start:48px;';

/** Google Docs (Chrome). Nested lists are <ul> children of <ul>, as Docs writes them. */
export const GOOGLE_DOCS_CLIPBOARD =
  '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-6c1d3a2e-7fff-0b21-4c5d-2e9f8a7b6c5d">' +
  `<h1 dir="ltr" style="line-height:1.38;margin-top:20pt;margin-bottom:6pt;">${span('Launch plan', GDOCS_SPAN.replace('11pt', '20pt'))}</h1>` +
  `<p dir="ltr" style="line-height:1.38;text-align:center;margin-top:0pt;margin-bottom:0pt;">` +
  span('Bold', GDOCS_SPAN.replace('font-weight:400', 'font-weight:700')) +
  span(', ') +
  span('italic', GDOCS_SPAN.replace('font-style:normal', 'font-style:italic')) +
  span(', ') +
  span(
    'underlined',
    GDOCS_SPAN.replace(
      'text-decoration:none',
      'text-decoration:underline;-webkit-text-decoration-skip:none;text-decoration-skip-ink:none',
    ),
  ) +
  span(' and ') +
  span('highlighted', GDOCS_SPAN.replace('background-color:transparent', 'background-color:#ffff00')) +
  span('.') +
  '</p><br>' +
  `<ul style="${GDOCS_UL}">` +
  `<li dir="ltr" style="${GDOCS_LI}" aria-level="1"><p dir="ltr" style="${GDOCS_P}" role="presentation">${span('Outer item')}</p></li>` +
  `<ul style="${GDOCS_UL}"><li dir="ltr" style="${GDOCS_LI.replace('disc', 'circle')}" aria-level="2"><p dir="ltr" style="${GDOCS_P}" role="presentation">${span('Nested item')}</p></li></ul>` +
  `<li dir="ltr" style="${GDOCS_LI}" aria-level="1"><p dir="ltr" style="${GDOCS_P}" role="presentation">${span('Second item')}</p></li>` +
  '</ul><br>' +
  `<ul style="${GDOCS_UL}">` +
  `<li dir="ltr" role="checkbox" aria-checked="true" style="${GDOCS_LI.replace('disc', 'none')}" aria-level="1"><img src="data:image/png;base64,iVBORw0KGgo=" width="17.6px" height="17.6px" alt="checked" aria-roledescription="checkbox" style="margin-right:3px;" /><p dir="ltr" style="display:inline-block;${GDOCS_P}" role="presentation">${span('Done task')}</p></li>` +
  `<li dir="ltr" role="checkbox" aria-checked="false" style="${GDOCS_LI.replace('disc', 'none')}" aria-level="1"><img src="data:image/png;base64,iVBORw0KGgo=" width="17.6px" height="17.6px" alt="unchecked" aria-roledescription="checkbox" style="margin-right:3px;" /><p dir="ltr" style="display:inline-block;${GDOCS_P}" role="presentation">${span('Open task')}</p></li>` +
  '</ul>' +
  `<p dir="ltr" style="${GDOCS_P}">` +
  span('E = mc') +
  span('2', GDOCS_SPAN.replace('vertical-align:baseline', 'vertical-align:super').replace('11pt', '0.6em')) +
  span(' and a ') +
  '<a href="https://example.com/" style="text-decoration:none;">' +
  span(
    'link',
    GDOCS_SPAN.replace('color:#000000', 'color:#1155cc').replace(
      'text-decoration:none',
      'text-decoration:underline;-webkit-text-decoration-skip:none;text-decoration-skip-ink:none',
    ),
  ) +
  '</a>' +
  span('.') +
  '</p></b>';

/** A web page copied in Chrome, which inlines computed styles. */
export const WEB_PAGE_CLIPBOARD =
  `<meta charset='utf-8'><h2 style="box-sizing: border-box; margin: 24px 0px 16px; font-weight: 600; font-size: 1.5em; color: rgb(31, 35, 40); font-family: -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, sans-serif; font-style: normal; background-color: rgb(255, 255, 255);">Getting started</h2>` +
  `<p style="box-sizing: border-box; margin-top: 0px; color: rgb(31, 35, 40); font-family: -apple-system, sans-serif; font-size: 16px; background-color: rgb(255, 255, 255);">Install it with <code style="box-sizing: border-box; padding: 0.2em 0.4em; background-color: rgba(129, 139, 152, 0.12); border-radius: 6px;">npm install</code>, then read the <span style="color: rgb(207, 34, 46);">warning</span> below.</p>` +
  `<br class="Apple-interchange-newline">`;

/** "Copy image" in a browser: the HTML holds only the image (the file comes separately). */
export const IMAGE_ONLY_CLIPBOARD = `<meta charset='utf-8'><img src="https://example.com/cat.png" alt="A cat">`;
