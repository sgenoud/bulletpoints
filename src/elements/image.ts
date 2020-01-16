import {
    getSmartParseNumber,
    encodeXmlEntities,
    genXmlColorSelection,
    genericParseFloat
} from '../gen-utils'

import ElementInterface from './element-interface'

import Hyperlink, { HyperLinkOptions } from './hyperlink'
import Position, { PositionOptions } from './position'

import { translateColor } from '../gen-utils'

const unitConverter = presLayout => ({
    x: x => getSmartParseNumber(x, 'X', presLayout),
    y: y => getSmartParseNumber(y, 'Y', presLayout)
})

const findExtension = (data = '', path = '') => {
    // STEP 1: Set extension
    // NOTE: Split to address URLs with params (eg: `path/brent.jpg?someParam=true`)
    let strImgExtn =
        path
            .substring(path.lastIndexOf('/') + 1)
            .split('?')[0]
            .split('.')
            .pop()
            .split('#')[0] || 'png'

    // However, pre-encoded images can be whatever mime-type they want (and good for them!)
    if (
        data &&
        /image\/(\w+)\;/.exec(data) &&
        /image\/(\w+)\;/.exec(data).length > 0
    ) {
        strImgExtn = /image\/(\w+)\;/.exec(data)[1]
    } else if (data && data.toLowerCase().indexOf('image/svg+xml') > -1) {
        strImgExtn = 'svg'
    }

    return strImgExtn
}

export type ObjectFitOptions = 'none' | 'fill' | 'cover' | 'contain' | 'crop'
export type ColorBlend = { darkColor?: string; lightColor?: string }
type ImageFormat = { height: string | number; width: string | number }

export type ImageOptions = PositionOptions & {
    image?: string
    rounding?: boolean
    opacity?: number | string
    placeholder?: string
    colorBlend?: ColorBlend
    objectFit?: ObjectFitOptions
    imageFormat?: ImageFormat
    data?: string
    path?: string
    hyperlink?: HyperLinkOptions
}

export default class ImageElement implements ElementInterface {
    imgId: number
    svgImgId: number

    sourceH
    sourceW

    position: Position

    image?: string

    objectFit: ObjectFitOptions
    imageFormat?: ImageFormat

    rounding?: boolean
    opacity?: number

    colorBlend: ColorBlend

    isSvg?: boolean
    placeholder?: string

    hyperlink?: Hyperlink

    constructor(options: ImageOptions, relations) {
        this.image = options.image
        this.rounding = options.rounding
        this.placeholder = options.placeholder

        this.colorBlend = options.colorBlend

        if (options.opacity) {
            const numberOpacity = genericParseFloat(options.opacity)
            if (numberOpacity < 1 && numberOpacity >= 0) {
                this.opacity = numberOpacity
            }
        }

        this.position = new Position({
            x: options.x,
            y: options.y,
            h: options.h,
            w: options.w,

            flipV: options.flipV,
            flipH: options.flipH,
            rotate: options.rotate
        })

        this.objectFit = options.objectFit
        this.imageFormat = options.imageFormat
        if (
            this.objectFit !== 'fill' &&
            this.objectFit !== 'none' &&
            (!this.imageFormat ||
                !this.imageFormat.width ||
                !this.imageFormat.height)
        ) {
            console.warn(
                `You need to specify full the width and height of the source for objectFit "${this.objectFit}"`
            )
            this.objectFit = 'fill'
        }

        let newObject: any = {
            type: null,
            text: null,
            options: null,
            image: null,
            imageRid: null,
            hyperlink: null
        }

        const extension = findExtension(options.data, options.path)

        this.image = options.path || 'preencoded.png'

        // STEP 4: Add this image to this Slide Rels
        if (extension === 'svg') {
            // SVG files consume *TWO* rId's: (a png version and the svg image)
            this.imgId = relations.registerImage(
                {
                    data: options.data,
                    // not sure why we add png to data here
                    path: options.path || `${options.data}png`
                },
                'png',
                { w: options.w, h: options.h }
            )

            this.svgImgId = relations.registerImage(
                {
                    data: options.data,
                    path: options.path || options.data
                },
                'svg'
            )
            this.isSvg = true
        } else {
            this.imgId = relations.registerImage(
                {
                    data: options.data,
                    path: options.path || `${options.data}.${extension}`
                },
                extension
            )
        }

        if (options.hyperlink) {
            this.hyperlink = new Hyperlink(options.hyperlink, relations)
        }
    }

    render(idx, presLayout, placeholder) {
        const placeholderPosition = placeholder ? placeholder.position : {}
        const correctedPosition = {
            x: this.position.x || placeholderPosition.x,
            y: this.position.y || placeholderPosition.y,
            h: this.position.h || placeholderPosition.h,
            w: this.position.w || placeholderPosition.w
        }

        const objectFit = new ObjectFit(
            this.objectFit || (placeholder && placeholder.objectFit),
            correctedPosition,
            this.imageFormat
        )
        const opacity = this.opacity || (placeholder && placeholder.opacity)
        const colorBlend =
            this.colorBlend || (placeholder && placeholder.colorBlend)

        return `
    <p:pic>
	    <p:nvPicPr>
	        <p:cNvPr id="${idx + 2}" name="Object ${idx +
            1}" descr="${encodeXmlEntities(this.image)}">
                ${this.hyperlink ? this.hyperlink.render() : ''}
			</p:cNvPr>
                <p:cNvPicPr>
                <a:picLocks noChangeAspect="1"/>
            </p:cNvPicPr>
                <p:nvPr>
                    ${placeholder ? placeholder.renderPlaceholderInfo() : ''}
                </p:nvPr>
		</p:nvPicPr>
        <p:blipFill>
			<a:blip r:embed="rId${this.imgId}">
            ${
                /* NOTE: This works for both cases: either `path` or `data` contains the SVG */
                this.isSvg
                    ? `<a:extLst>
                <a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}">
                    <asvg:svgBlip
                        xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" 
                        r:embed="rId${this.svgImgId}"/>
                    </a:ext>
                </a:extLst>`
                    : ''
            }
                ${opacity ? `<a:alphaModFix amt="${opacity * 100000}"/>` : ''}
                ${colorBlend ? duoToneEffect(colorBlend) : ''}
            </a:blip>
        ${objectFit.render(presLayout)}
		</p:blipFill>
		<p:spPr>
		    ${this.position.render(presLayout)}
		    <a:prstGeom prst="${
                this.rounding ? 'ellipse' : 'rect'
            }"><a:avLst/></a:prstGeom>
		</p:spPr>
	</p:pic>`
    }
}

class ObjectFit {
    fitType

    sourceW
    sourceH

    x
    y
    w
    h

    constructor(
        fitType = 'fill',
        position: { x; y; w; h },
        source: ImageFormat
    ) {
        this.fitType = fitType
        this.x = position.x
        this.y = position.y
        this.w = position.w
        this.h = position.h

        if (
            (this.fitType !== 'fill' || this.fitType !== 'none') &&
            (!source || !source.width || !source.height)
        ) {
            console.warn(
                `You need to specify full the width and height of the source for objectFit "${this.fitType}"`
            )
            this.fitType = 'fill'
        } else {
            this.sourceW = source.width
            this.sourceH = source.height
        }
    }

    get boxRatio() {
        return this.h / this.w
    }

    get imgRatio() {
        return parseFloat(this.sourceH) / parseFloat(this.sourceW)
    }

    renderCover(unit) {
        const h = unit.y(this.h)
        const w = unit.x(this.w)

        const boxRatio = h / w

        const isBoxBased = boxRatio > this.imgRatio
        const width = isBoxBased ? h / this.imgRatio : w
        const height = isBoxBased ? h : w * this.imgRatio
        const hzPerc = Math.round(1e5 * 0.5 * (1 - w / width))
        const vzPerc = Math.round(1e5 * 0.5 * (1 - h / height))
        return `<a:srcRect l="${hzPerc}" r="${hzPerc}" t="${vzPerc}" b="${vzPerc}"/><a:stretch/>`
    }

    renderContain(unit) {
        const h = unit.y(this.h)
        const w = unit.x(this.w)

        const boxRatio = h / w

        const widthBased = boxRatio > this.imgRatio
        const width = widthBased ? w : h / this.imgRatio
        const height = widthBased ? w * this.imgRatio : h
        const hzPerc = Math.round(1e5 * 0.5 * (1 - w / width))
        const vzPerc = Math.round(1e5 * 0.5 * (1 - h / height))
        return `<a:srcRect l="${hzPerc}" r="${hzPerc}" t="${vzPerc}" b="${vzPerc}"/><a:stretch/>`
    }

    renderCrop(unit) {
        const imageW = unit.x(this.sourceW)
        const imageH = unit.y(this.sourceH)

        const l = unit.x(this.x)
        const r = imageW - (l + unit.x(this.w))
        const t = unit.y(this.y)
        const b = imageH - (t + unit.y(this.h))

        const lPerc = Math.round(1e5 * (l / imageW))
        const rPerc = Math.round(1e5 * (r / imageW))
        const tPerc = Math.round(1e5 * (t / imageH))
        const bPerc = Math.round(1e5 * (b / imageH))

        return `<a:srcRect l="${lPerc}" r="${rPerc}" t="${tPerc}" b="${bPerc}"/><a:stretch/>`
    }

    render(presLayout) {
        const unitConv = unitConverter(presLayout)

        if (this.fitType === 'cover') {
            return this.renderCover(unitConv)
        }

        if (this.fitType === 'contain') {
            return this.renderContain(unitConv)
        }

        if (this.fitType === 'crop') {
            return this.renderCrop(unitConv)
        }

        if (this.fitType === 'none') {
            return ''
        }

        // Format for fill as default
        return '<a:stretch><a:fillRect/></a:stretch>'
    }
}

const duoToneEffect = ({
    darkColor = '226622',
    lightColor = 'FFFFFF'
}: ColorBlend) => {
    return `
            <a:duotone>
              <a:srgbClr val="${translateColor(darkColor)}"/>
              <a:srgbClr val="${translateColor(lightColor)}"/>
            </a:duotone>
    `
}