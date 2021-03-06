import {
    CRLF,
    LAYOUT_IDX_SERIES_BASE,
    PLACEHOLDER_TYPES,
    SLDNUMFLDID,
    DEF_PRES_LAYOUT_NAME
} from './core-enums'
import { PowerPointShapes } from './core-shapes'
import {
    ILayout,
    ISlideRel,
    ISlideRelChart,
    ISlideRelMedia
} from './core-interfaces'
import { encodeXmlEntities, genXmlColorSelection } from './gen-utils'
import { Master } from './slideLayouts'
import Slide from './slide'

import XML_HEADER from './templates/xml-header'
import NAMESPACE_DEF from './templates/namespace-def'
import MASTER_TEXT_DEFAULTS from './templates/master-text-defaults'

import ElementInterface from './elements/element-interface'

import TextElement from './elements/text'
import ImageElement from './elements/image'

/**
 * Transforms a slide or slideLayout to resulting XML string - Creates `ppt/slide*.xml`
 * @param {Slide|Master} slideObject - slide object created within createSlideObject
 * @return {string} XML string with <p:cSld> as the root
 */
function slideObjectToXml(slide: Slide | Master): string {
    let strSlideXml: string = slide.name
        ? `<p:cSld name="${slide.name}">`
        : '<p:cSld>'

    // STEP 1: Add background
    if (slide.bkgd) {
        strSlideXml += genXmlColorSelection(null, slide.bkgd)
    } else if (
        !slide.bkgd &&
        slide.name &&
        slide.name === DEF_PRES_LAYOUT_NAME
    ) {
        // NOTE: Default [white] background is needed on slideMaster1.xml
        // to avoid gray background in Keynote (and Finder previews)
        strSlideXml +=
            '<p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>'
    }

    // STEP 2: Add background image (using Strech) (if any)
    if (slide instanceof Master && slide.bkgdImgRid) {
        // FIXME: We should be doing this in the slideLayout...
        strSlideXml += [
            '<p:bg>',
            '<p:bgPr><a:blipFill dpi="0" rotWithShape="1">',
            `<a:blip r:embed="rId${slide.bkgdImgRid}"><a:lum/></a:blip>`,
            '<a:srcRect/><a:stretch><a:fillRect/></a:stretch></a:blipFill>',
            '<a:effectLst/></p:bgPr>',
            '</p:bg>'
        ].join('')
    }

    // STEP 3: Continue slide by starting spTree node
    strSlideXml += [
        '<p:spTree>',
        '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>',
        '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>',
        '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
    ].join('')

    // STEP 4: Loop over all Slide.data objects and add them to this slide
    strSlideXml += slide.data
        .map((element: ElementInterface, idx: number): string => {
            if (
                slide instanceof Slide &&
                (element instanceof TextElement ||
                    element instanceof ImageElement)
            ) {
                const placeholder =
                    slide.slideLayout &&
                    slide.slideLayout.getPlaceholder(element.placeholder)
                return element.render(idx, slide.presLayout, placeholder)
            }
            return element.render(idx, slide.presLayout, null)
        })
        .join('')

    // STEP 6: Close spTree and finalize slide XML
    strSlideXml += '</p:spTree>'
    strSlideXml += '</p:cSld>'

    // LAST: Return
    return strSlideXml
}

// XML-GEN: First 6 functions create the base /ppt files

/**
 * Generate XML ContentType
 * @param {Slide[]} slides - slides
 * @param {Master[]} slideLayouts - slide layouts
 * @param {Slide} masterSlide - master slide
 * @returns XML
 */

export function makeXmlContTypes(
    slides: Slide[],
    slideLayouts: Master[],
    masterSlide?: Slide
): string {
    const EXCLUDES = new Set([
        'image',
        'online',
        'chart',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'video/mp4'
    ])
    const extensions = new Map()

    const allSlidesLike = [...slides, ...slideLayouts, masterSlide]

    allSlidesLike.forEach(slide =>
        slide.relations.relsMedia.forEach(({ type, extn }) => {
            if (EXCLUDES.has(type) || extensions.has(type) || extn === 'm4v')
                return
            extensions.set(type, extn)
        })
    )
    const allExtensions = [...extensions.entries()]

    const allChartTargets = []
    allSlidesLike.forEach(slide => {
        return slide.relations.relsChart.forEach(({ Target }) =>
            allChartTargets.push(Target)
        )
    })

    const extensionsInfo = allExtensions.map(
        ([type, extn]) => `<Default Extension="${extn}" ContentType="${type}"/>`
    )

    const slidesInfo = slides.map((slide, idx) => {
        const index = idx + 1
        return [
            `<Override PartName="/ppt/slideMasters/slideMaster${index}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>`,
            `<Override PartName="/ppt/slides/slide${index}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
            ` <Override PartName="/ppt/notesSlides/notesSlide${index}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`
        ].join('')
    })

    const slideLayoutInfo = slideLayouts.map((layout, idx) => {
        const index = idx + 1
        return `<Override PartName="/ppt/slideLayouts/slideLayout${index}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>`
    })

    const chartInfos = allChartTargets.map(
        t =>
            ` <Override PartName="${t}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`
    )

    return [
        XML_HEADER,
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
        '<Default Extension="xml" ContentType="application/xml"/>',
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
        '<Default Extension="jpeg" ContentType="image/jpeg"/>',
        '<Default Extension="jpg" ContentType="image/jpg"/>',
        // STEP 1: Add standard/any media types used in Presenation
        '<Default Extension="png" ContentType="image/png"/>',
        '<Default Extension="gif" ContentType="image/gif"/>',
        // NOTE: Hard-Code this extension as it wont be created in loop below (as extn !== type)
        '<Default Extension="m4v" ContentType="video/mp4"/>',
        '<Default Extension="mp4" ContentType="video/mp4"/>',
        ...extensionsInfo,
        '<Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/>',
        '<Default Extension="xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/>',

        '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>',
        '<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/>',
        '<Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>',
        '<Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>',
        '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>',
        '<Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>',

        ...slidesInfo,
        ...slideLayoutInfo,
        ...chartInfos,
        ' <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
        ' <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>',
        '</Types>'
    ].join('')
}

/**
 * Creates `_rels/.rels`
 * @returns XML
 */
export function makeXmlRootRels(): string {
    return [
        XML_HEADER,
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>',
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>',
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>',
        '</Relationships>'
    ].join('')
}

/**
 * Creates `docProps/app.xml`
 * @param {Slide[]} slides - Presenation Slides
 * @param {string} company - "Company" metadata
 * @returns XML
 */
export function makeXmlApp(slides: Slide[], company: string): string {
    return `${XML_HEADER}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
	<TotalTime>0</TotalTime>
	<Words>0</Words>
	<Application>Microsoft Office PowerPoint</Application>
	<PresentationFormat>On-screen Show (16:9)</PresentationFormat>
	<Paragraphs>0</Paragraphs>
	<Slides>${slides.length}</Slides>
	<Notes>${slides.length}</Notes>
	<HiddenSlides>0</HiddenSlides>
	<MMClips>0</MMClips>
	<ScaleCrop>false</ScaleCrop>
	<HeadingPairs>
		<vt:vector size="6" baseType="variant">
			<vt:variant><vt:lpstr>Fonts Used</vt:lpstr></vt:variant>
			<vt:variant><vt:i4>2</vt:i4></vt:variant>
			<vt:variant><vt:lpstr>Theme</vt:lpstr></vt:variant>
			<vt:variant><vt:i4>1</vt:i4></vt:variant>
			<vt:variant><vt:lpstr>Slide Titles</vt:lpstr></vt:variant>
			<vt:variant><vt:i4>${slides.length}</vt:i4></vt:variant>
		</vt:vector>
	</HeadingPairs>
	<TitlesOfParts>
		<vt:vector size="${slides.length + 1 + 2}" baseType="lpstr">
			<vt:lpstr>Arial</vt:lpstr>
			<vt:lpstr>Calibri</vt:lpstr>
			<vt:lpstr>Office Theme</vt:lpstr>
			${slides
                .map((_slideObj, idx) => {
                    return '<vt:lpstr>Slide ' + (idx + 1) + '</vt:lpstr>\n'
                })
                .join('')}
		</vt:vector>
	</TitlesOfParts>
	<Company>${company}</Company>
	<LinksUpToDate>false</LinksUpToDate>
	<SharedDoc>false</SharedDoc>
	<HyperlinksChanged>false</HyperlinksChanged>
	<AppVersion>16.0000</AppVersion>
	</Properties>`
}

/**
 * Creates `docProps/core.xml`
 * @param {string} title - metadata data
 * @param {string} company - metadata data
 * @param {string} author - metadata value
 * @param {string} revision - metadata value
 * @returns XML
 */
export function makeXmlCore(
    title: string,
    subject: string,
    author: string,
    revision: string
): string {
    return `${XML_HEADER}
	<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
		<dc:title>${encodeXmlEntities(title)}</dc:title>
		<dc:subject>${encodeXmlEntities(subject)}</dc:subject>
		<dc:creator>${encodeXmlEntities(author)}</dc:creator>
		<cp:lastModifiedBy>${encodeXmlEntities(author)}</cp:lastModifiedBy>
		<cp:revision>${revision}</cp:revision>
		<dcterms:created xsi:type="dcterms:W3CDTF">${new Date()
            .toISOString()
            .replace(/\.\d\d\dZ/, 'Z')}</dcterms:created>
		<dcterms:modified xsi:type="dcterms:W3CDTF">${new Date()
            .toISOString()
            .replace(/\.\d\d\dZ/, 'Z')}</dcterms:modified>
	</cp:coreProperties>`
}

/**
 * Creates `ppt/_rels/presentation.xml.rels`
 * @param {Slide[]} slides - Presenation Slides
 * @returns XML
 */
export function makeXmlPresentationRels(slides: Array<Slide>): string {
    let intRelNum = 1
    let strXml = XML_HEADER
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + CRLF
    strXml +=
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    strXml +=
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>'
    for (let idx = 1; idx <= slides.length; idx++) {
        strXml +=
            '<Relationship Id="rId' +
            ++intRelNum +
            '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide' +
            idx +
            '.xml"/>'
    }
    intRelNum++
    strXml +=
        '<Relationship Id="rId' +
        intRelNum +
        '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="notesMasters/notesMaster1.xml"/>' +
        '<Relationship Id="rId' +
        (intRelNum + 1) +
        '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/>' +
        '<Relationship Id="rId' +
        (intRelNum + 2) +
        '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/>' +
        '<Relationship Id="rId' +
        (intRelNum + 3) +
        '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>' +
        '<Relationship Id="rId' +
        (intRelNum + 4) +
        '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/>' +
        '</Relationships>'

    return strXml
}

// XML-GEN: Functions that run 1-N times (once for each Slide)

/**
 * Generates XML for the slide file (`ppt/slides/slide1.xml`)
 * @param {Slide} slide - the slide object to transform into XML
 * @return {string} XML
 */
export function makeXmlSlide(slide: Slide): string {
    return (
        XML_HEADER +
        `<p:sld ${NAMESPACE_DEF}${slide && slide.hidden ? ' show="0"' : ''}>` +
        slideObjectToXml(slide) +
        `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>` +
        `</p:sld>`
    )
}

/**
 * Creates Notes Slide (`ppt/notesSlides/notesSlide1.xml`)
 * @param {Slide} slide - the slide object to transform into XML
 * @return {string} XML
 */
export function makeXmlNotesSlide(slide: Slide): string {
    let notesText = ''
    if (slide.notes) {
        notesText = slide.notes.join('').replace(/\r*\n/g, CRLF)
    }

    return (
        XML_HEADER +
        '<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
        '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/>' +
        '<p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/>' +
        '<a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/>' +
        '</a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/>' +
        '<p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr>' +
        '<p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/>' +
        '</p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/>' +
        '<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr>' +
        '<p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/>' +
        '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r>' +
        '<a:rPr lang="en-US" dirty="0"/><a:t>' +
        encodeXmlEntities(notesText) +
        '</a:t></a:r><a:endParaRPr lang="en-US" dirty="0"/></a:p></p:txBody>' +
        '</p:sp><p:sp><p:nvSpPr><p:cNvPr id="4" name="Slide Number Placeholder 3"/>' +
        '<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr>' +
        '<p:ph type="sldNum" sz="quarter" idx="10"/></p:nvPr></p:nvSpPr>' +
        '<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p>' +
        '<a:fld id="' +
        SLDNUMFLDID +
        '" type="slidenum">' +
        '<a:rPr lang="en-US"/><a:t>' +
        slide.number +
        '</a:t></a:fld><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>' +
        '</p:spTree><p:extLst><p:ext uri="{BB962C8B-B14F-4D97-AF65-F5344CB8AC3E}">' +
        '<p14:creationId xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" val="1024086991"/>' +
        '</p:ext></p:extLst></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>'
    )
}

/**
 * Generates the XML layout resource from a layout object
 * @param {Master} layout - slide layout (master)
 * @return {string} XML
 */
export function makeXmlLayout(layout: Master): string {
    return `${XML_HEADER}
		<p:sldLayout ${NAMESPACE_DEF} preserve="1">
		  ${slideObjectToXml(layout)}
      <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
    </p:sldLayout>`
}

/**
 * Creates Slide Master 1 (`ppt/slideMasters/slideMaster1.xml`)
 * @param {Slide} slide - slide object that represents master slide layout
 * @param {Master[]} layouts - slide layouts
 * @return {string} XML
 */
export function makeXmlMaster(slide: Slide, layouts: Master[]): string {
    // NOTE: Pass layouts as static rels because they are not referenced any time

    let layoutDefs = layouts
        .map((_layoutDef, idx) => {
            const id = LAYOUT_IDX_SERIES_BASE + idx
            const rId = slide.rels.length + idx + 1
            return `<p:sldLayoutId id="${id}" r:id="rId${rId}"/>`
        })
        .join('')

    return [
        XML_HEADER,
        `<p:sldMaster ${NAMESPACE_DEF}>`,
        slideObjectToXml(slide),
        '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>',
        `<p:sldLayoutIdLst>${layoutDefs}</p:sldLayoutIdLst>`,
        '<p:hf sldNum="0" hdr="0" ftr="0" dt="0"/>',
        MASTER_TEXT_DEFAULTS,
        '</p:sldMaster>'
    ].join('')
}

/**
 * Generates XML string for a slide layout relation file
 * @param {number} layoutNumber - 1-indexed number of a layout that relations are generated for
 * @param {Master[]} slideLayouts - Slide Layouts
 * @return {string} XML
 */
export function makeXmlSlideLayoutRel(
    layoutNumber: number,
    slideLayouts: Master[]
): string {
    return slideLayouts[layoutNumber - 1].relations.render([
        {
            target: '../slideMasters/slideMaster1.xml',
            type: 'slideMaster'
        }
    ])
}

/**
 * Creates `ppt/_rels/slide*.xml.rels`
 * @param {Slide[]} slides
 * @param {Master[]} slideLayouts - Slide Layout(s)
 * @param {number} `slideNumber` 1-indexed number of a layout that relations are generated for
 * @return {string} XML
 */
export function makeXmlSlideRel(
    slides: Slide[],
    slideLayouts: Master[],
    slideNumber: number
): string {
    return slides[slideNumber - 1].relations.render([
        {
            target: `../slideLayouts/slideLayout${getLayoutIdxForSlide(
                slides,
                slideLayouts,
                slideNumber
            )}.xml`,
            type: 'slideLayout'
        },
        {
            target: `../notesSlides/notesSlide${slideNumber}.xml`,
            type: 'notesSlide'
        }
    ])
}

/**
 * Generates XML string for a slide relation file.
 * @param {number} slideNumber - 1-indexed number of a layout that relations are generated for
 * @return {string} XML
 */
export function makeXmlNotesSlideRel(slideNumber: number): string {
    return `${XML_HEADER}
		<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
			<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="../notesMasters/notesMaster1.xml"/>
			<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide${slideNumber}.xml"/>
		</Relationships>`
}

/**
 * Creates `ppt/slideMasters/_rels/slideMaster1.xml.rels`
 * @param {Slide} masterSlide - Slide object
 * @param {Master[]} slideLayouts - Slide Layouts
 * @return {string} XML
 */
export function makeXmlMasterRel(
    masterSlide: Slide,
    slideLayouts: Master[]
): string {
    let defaultRels = slideLayouts.map((_layoutDef, idx) => {
        return {
            target: `../slideLayouts/slideLayout${idx + 1}.xml`,
            type: 'slideLayout'
        }
    })
    defaultRels.push({
        target: '../theme/theme1.xml',
        type: 'theme'
    })

    return masterSlide.relations.render(defaultRels)
}

/**
 * Creates `ppt/notesMasters/_rels/notesMaster1.xml.rels`
 * @return {string} XML
 */
export function makeXmlNotesMasterRel(): string {
    return `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
		<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
		</Relationships>`
}

/**
 * For the passed slide number, resolves name of a layout that is used for.
 * @param {Slide[]} slides - srray of slides
 * @param {Master[]} slideLayouts - array of slideLayouts
 * @param {number} slideNumber
 * @return {number} slide number
 */
function getLayoutIdxForSlide(
    slides: Slide[],
    slideLayouts: Master[],
    slideNumber: number
): number {
    for (let i = 0; i < slideLayouts.length; i++) {
        if (slideLayouts[i].name === slides[slideNumber - 1].slideLayout.name) {
            return i + 1
        }
    }

    // IMPORTANT: Return 1 (for `slideLayout1.xml`) when no def is found
    // So all objects are in Layout1 and every slide that references it uses this layout.
    return 1
}

// XML-GEN: Last 5 functions create root /ppt files

/**
 * Creates `ppt/theme/theme1.xml`
 * @return {string} XML
 */

/**
 * Create presentation file (`ppt/presentation.xml`)
 * @see https://docs.microsoft.com/en-us/office/open-xml/structure-of-a-presentationml-document
 * @see http://www.datypic.com/sc/ooxml/t-p_CT_Presentation.html
 * @param {Slide[]} slides - array of slides
 * @param {ILayout} pptLayout - presentation layout
 * @param {boolean} rtlMode - RTL mode
 * @return {string} XML
 */
export function makeXmlPresentation(
    slides: Slide[],
    pptLayout: ILayout,
    rtlMode: boolean
): string {
    return `${XML_HEADER}
<p:presentation ${NAMESPACE_DEF} ${
        rtlMode ? 'rtl="1" ' : ''
    } saveSubsetFonts="1" autoCompressPictures="0">
  ${
      '' /*IMPORTANT: must be in this order or PPT will give corruption message on open!*/
  }
    <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
    <p:sldIdLst>
    ${[...Array(slides.length).keys()]
        .map(idx => {
            return `<p:sldId id="${idx + 256}" r:id="rId${idx + 2}"/>`
        })
        .join('')}
    </p:sldIdLst>
    ${
        ''
        // NOTE: length+2 is from `presentation.xml.rels` func
        //(since we have to match this rId, we just use same logic))
    }
    <p:notesMasterIdLst>
      <p:notesMasterId r:id="rId${slides.length + 2}"/>
    </p:notesMasterIdLst>
    <p:sldSz cx="${pptLayout.width}" cy="${pptLayout.height}"/>
    <p:notesSz cx="${pptLayout.height}" cy="${pptLayout.width}"/>
    <p:defaultTextStyle>

    ${[...Array(9).keys()]
        .map(idx =>
            [
                `<a:lvl${idx + 1}pPr`,
                ` marL="${idx * 457200}"`,
                ' algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1">',
                '<a:defRPr sz="1800" kern="1200">',
                '<a:solidFill><a:schemeClr val="tx1"/></a:solidFill>',
                '<a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/>',
                '</a:defRPr>',
                `</a:lvl${idx + 1}pPr>`
            ].join('')
        )
        .join('')}
    </p:defaultTextStyle>
</p:presentation>`
}

/**
 * Create `ppt/presProps.xml`
 * @return {string} XML
 */
export function makeXmlPresProps(): string {
    return `${XML_HEADER}<p:presentationPr ${NAMESPACE_DEF}/>`
}

/**
 * Create `ppt/tableStyles.xml`
 * @see: http://openxmldeveloper.org/discussions/formats/f/13/p/2398/8107.aspx
 * @return {string} XML
 */
export function makeXmlTableStyles(): string {
    return `${XML_HEADER}<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`
}

/**
 * Creates `ppt/viewProps.xml`
 * @return {string} XML
 */
export function makeXmlViewProps(): string {
    return `${XML_HEADER}<p:viewPr ${NAMESPACE_DEF}><p:normalViewPr horzBarState="maximized"><p:restoredLeft sz="15611"/><p:restoredTop sz="94610"/></p:normalViewPr><p:slideViewPr><p:cSldViewPr snapToGrid="0" snapToObjects="1"><p:cViewPr varScale="1"><p:scale><a:sx n="136" d="100"/><a:sy n="136" d="100"/></p:scale><p:origin x="216" y="312"/></p:cViewPr><p:guideLst/></p:cSldViewPr></p:slideViewPr><p:notesTextViewPr><p:cViewPr><p:scale><a:sx n="1" d="1"/><a:sy n="1" d="1"/></p:scale><p:origin x="0" y="0"/></p:cViewPr></p:notesTextViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`
}

export function getShapeInfo(shapeName) {
    if (!shapeName) return PowerPointShapes.RECTANGLE

    if (
        typeof shapeName === 'object' &&
        shapeName.name &&
        shapeName.displayName &&
        shapeName.avLst
    )
        return shapeName

    if (PowerPointShapes[shapeName]) return PowerPointShapes[shapeName]

    let objShape = Object.keys(PowerPointShapes).filter((key: string) => {
        return (
            PowerPointShapes[key].name === shapeName ||
            PowerPointShapes[key].displayName
        )
    })[0]
    if (typeof objShape !== 'undefined' && objShape !== null) return objShape

    return PowerPointShapes.RECTANGLE
}
