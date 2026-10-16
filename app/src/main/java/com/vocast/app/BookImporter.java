package com.vocast.app;
import java.io.*;
import java.nio.*;
import java.nio.charset.*;
import java.util.*;
import java.util.zip.*;
import javax.xml.parsers.*;
import org.w3c.dom.*;

final class BookImporter {
    static String encoding(byte[] data){
        if(data.length>=2&&((data[0]==(byte)0xff&&data[1]==(byte)0xfe)||(data[0]==(byte)0xfe&&data[1]==(byte)0xff)))return "UTF-16";
        String utf=new String(data,StandardCharsets.UTF_8);int damaged=0;for(int i=0;i<utf.length();i++)if(utf.charAt(i)=='\ufffd')damaged++;
        // A damaged byte in an otherwise UTF-8 novel must not recode every valid character.
        return damaged<=Math.max(1,utf.length()/200)?"UTF-8":"GB18030";
    }
    static String text(byte[] data){return text(data,encoding(data));}
    static String text(byte[] data,String encoding){return new String(data,Charset.forName(encoding)).replaceFirst("^\ufeff","");}
    static Document xml(byte[] data) throws Exception {
        // Android's parser does not implement all SAX feature switches. Reject declarations
        // ourselves and retain the resolver, so unsupported switches cannot break EPUB imports.
        String markup=new String(data,StandardCharsets.UTF_8).replace("\u0000", "");
        if(markup.toUpperCase(Locale.ROOT).contains("<!ENTITY"))throw new IOException("EPUB 含不安全的 XML 实体声明");
        if(markup.toUpperCase(Locale.ROOT).contains("<!DOCTYPE")){
            // Common XHTML EPUBs use an external DTD; remove it without loading external resources.
            if(markup.matches("(?s).*(?i:<!DOCTYPE)[^>]*\\[.*"))throw new IOException("EPUB 含不支持的内部 DTD");
            markup=markup.replaceAll("(?is)<!DOCTYPE[^>]*>","");data=markup.getBytes(StandardCharsets.UTF_8);
        }
        DocumentBuilderFactory f=DocumentBuilderFactory.newInstance();f.setNamespaceAware(true);
        for(String feature:new String[]{"http://xml.org/sax/features/external-general-entities","http://xml.org/sax/features/external-parameter-entities","http://apache.org/xml/features/nonvalidating/load-external-dtd"})try{f.setFeature(feature,false);}catch(ParserConfigurationException ignored){}
        DocumentBuilder b=f.newDocumentBuilder();b.setEntityResolver((p,s)->new org.xml.sax.InputSource(new StringReader("")));return b.parse(new ByteArrayInputStream(data));
    }
    static String epub(byte[] data) throws Exception {
        Map<String,byte[]> files=new HashMap<>();int total=0;try(ZipInputStream zip=new ZipInputStream(new ByteArrayInputStream(data))){ZipEntry e;while((e=zip.getNextEntry())!=null){if(e.isDirectory())continue;byte[] raw=AudioFiles.read(zip,12*1024*1024);total+=raw.length;if(total>40*1024*1024)throw new IOException("EPUB 解压内容过大");files.put(e.getName(),raw);}}
        byte[] container=files.get("META-INF/container.xml");if(container==null)throw new IOException("EPUB 缺少目录");NodeList roots=xml(container).getElementsByTagNameNS("*","rootfile");if(roots.getLength()==0)throw new IOException("EPUB 缺少 package");String opf=((Element)roots.item(0)).getAttribute("full-path");byte[] opfBytes=files.get(opf);if(opfBytes==null)throw new IOException("EPUB package 丢失");Document doc=xml(opfBytes);String base=opf.contains("/")?opf.substring(0,opf.lastIndexOf('/')+1):"";Map<String,String> manifest=new HashMap<>();NodeList items=doc.getElementsByTagNameNS("*","item");for(int i=0;i<items.getLength();i++){Element e=(Element)items.item(i);manifest.put(e.getAttribute("id"),e.getAttribute("href"));}
        StringBuilder out=new StringBuilder();NodeList spine=doc.getElementsByTagNameNS("*","itemref");for(int i=0;i<spine.getLength();i++){String href=manifest.get(((Element)spine.item(i)).getAttribute("idref"));if(href==null)continue;String name=new java.net.URI(base+href.split("#")[0]).normalize().getPath();byte[] chapter=files.get(name);if(chapter==null)continue;Document ch=xml(chapter);NodeList body=ch.getElementsByTagNameNS("*","body");if(body.getLength()==0)continue;StringBuilder content=new StringBuilder();walk(body.item(0),content);String first=content.toString().trim().split("\\R",2)[0].trim();if(first.isEmpty())continue;out.append('\n');if(!first.matches("(?i)(?:第[0-9０-９零〇一二三四五六七八九十百千万两]+[章节回卷部](?:[\\s：:、.．—-].*)?|Chapter\\s+[0-9]+(?:[\\s：:、.．—-].*)?|(?:楔子|序章|序言|前言|后记|番外)(?:[\\s：:、.．—-].*)?|={2,}.+={2,})"))out.append("第").append(i+1).append("章\n");out.append(content);}
        if(out.toString().trim().isEmpty())throw new IOException("无法解析 EPUB 正文，可能加密或格式不支持");return out.toString();
    }
    static void walk(Node node,StringBuilder text){String name=node.getLocalName();if("script".equals(name)||"style".equals(name))return;if(node.getNodeType()==Node.TEXT_NODE)text.append(node.getNodeValue());for(Node n=node.getFirstChild();n!=null;n=n.getNextSibling())walk(n,text);if(Arrays.asList("p","div","h1","h2","h3","br","li").contains(name))text.append('\n');}
}
